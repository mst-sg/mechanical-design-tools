import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { build } from "esbuild";

// Real browser navigation + HTTP transport, with a deliberately slow event
// response. No request interception or OCR double is needed for this contract.
test("private usage event completes after navigating away", async ({
  page,
}) => {
  const bundle = await build({
    entryPoints: ["src/jobs.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  let delivered = 0;
  let disconnected = 0;
  const server = createServer((request, response) => {
    if (request.url === "/client.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(bundle.outputFiles[0].contents);
    } else if (request.url?.endsWith("/exported")) {
      expect(request.method).toBe("POST");
      expect(request.headers.authorization).toBe(`Bearer ${"a".repeat(64)}`);
      response.on("finish", () => delivered++);
      response.on("close", () => {
        if (!response.writableFinished) disconnected++;
      });
      request.resume();
      setTimeout(() => {
        response.writeHead(204);
        response.end();
      }, 350);
    } else {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(
        request.url === "/left"
          ? "<h1>Another page</h1>"
          : `<button id="leave">Export then leave</button><script type="module">
import { jobEvent } from '/client.js';
document.querySelector('#leave').onclick = () => {
  void jobEvent({id:'11111111-1111-4111-8111-111111111111', token:'${"a".repeat(64)}'}, 'exported');
  setTimeout(() => { location.href = '/left'; }, 20);
};
</script>`,
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  try {
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.getByRole("button", { name: "Export then leave" }).click();
    await page.waitForURL("**/left");
    await expect(
      page.getByRole("heading", { name: "Another page" }),
    ).toBeVisible();
    await expect.poll(() => delivered, { timeout: 2000 }).toBe(1);
    expect(disconnected).toBe(0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
