import { test, expect, type Page, type TestInfo } from "@playwright/test";

const corePattern = "**/vendor/core/*.wasm.js";
function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => (release = resolve));
  return { wait, release };
}
function record(page: Page) {
  const evidence: string[] = [],
    errors: string[] = [];
  const origin = new URL(
    process.env.MST_TOOLS_BASE_URL || "http://127.0.0.1:4173",
  ).origin;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    const message = m.text(),
      location = m.location().url;
    evidence.push(`console ${m.type()}: ${message} ${location}`);
    if (m.type() !== "error") return;
    const injectedFailure =
      location.includes("/vendor/core/") &&
      message.startsWith("Failed to load resource:");
    const symbolDiagnostic =
      /^Image too small to scale!! \(\d+x\d+ vs min width of 3\)$/.test(
        message,
      ) || message === "Line cannot be recognized!!";
    if (!injectedFailure && !symbolDiagnostic) errors.push(message);
  });
  page.on("request", (r) => {
    if (
      !r.url().startsWith("blob:") &&
      !r.url().startsWith("data:") &&
      new URL(r.url()).origin !== origin
    )
      errors.push(`Unexpected egress: ${r.url()}`);
    if (r.method() !== "GET") errors.push(`Unexpected write: ${r.method()}`);
  });
  page.on("requestfailed", (r) => {
    const entry = `${r.failure()?.errorText} ${r.url()}`;
    evidence.push(`requestfailed ${entry}`);
    if (!r.url().includes("/vendor/core/")) errors.push(entry);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  return async (info: TestInfo) => {
    await info.attach("injected-network-fault-diagnostics", {
      body: JSON.stringify({ evidence, errors }, null, 2),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  };
}

test("a stalled OCR download retries and reads the actual P&ID sample", async ({
  page,
}, info) => {
  const verify = record(page),
    first = gate(),
    second = gate();
  let requests = 0;
  await page.route(corePattern, async (route) => {
    const attempt = ++requests;
    if (attempt === 1) {
      await first.wait;
      await route.abort("aborted").catch(() => {});
    } else {
      if (attempt === 2) await second.wait;
      await route.continue();
    }
  });
  try {
    await page.goto("/tools/pid-tag-check/");
    await page
      .getByRole("button", { name: "Try a sample", exact: true })
      .click();
    const started = Date.now();
    await page.getByRole("button", { name: "Read text" }).click();
    await expect(
      page.getByText("Download stalled. Retrying recognition engine…", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 20000 });
    await expect.poll(() => requests).toBe(2);
    first.release();
    second.release();
    await expect(page.getByLabel("Drawing tags", { exact: true })).toHaveValue(
      /PT-101/,
      { timeout: 60000 - (Date.now() - started) },
    );
    expect(
      (await page.getByLabel("Drawing tags", { exact: true }).inputValue())
        .split("\n")
        .sort(),
    ).toEqual(["FT-102", "P-101", "PT-101", "PT-101", "XV-104"]);
    expect(Date.now() - started).toBeLessThan(60000);
    await verify(info);
  } finally {
    first.release();
    second.release();
  }
});

test("cancelled and failed downloads retain the drawing and permit a real retry", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop-chromium",
    "Shared transport failure/cancellation path; timed recovery runs on all browsers.",
  );
  const verify = record(page),
    held = gate();
  let requests = 0;
  await page.route(corePattern, async (route) => {
    if (++requests === 1) {
      await held.wait;
      await route.abort("aborted").catch(() => {});
    } else await route.abort("connectionfailed");
  });
  try {
    await page.goto("/tools/title-block-reader/");
    await page
      .getByRole("button", { name: "Try a sample", exact: true })
      .click();
    const preview = page.locator(".drawing-preview img");
    const source = await preview.getAttribute("src");
    await page.getByRole("button", { name: "Read text" }).click();
    await expect.poll(() => requests).toBe(1);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("cancelled");
    held.release();
    await expect(preview).toHaveAttribute("src", source!);
    expect(requests).toBe(1);
    await page.getByRole("button", { name: "Read text" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "could not finish downloading. Your drawing is still here.",
    );
    expect(requests).toBe(3);
    await expect(preview).toHaveAttribute("src", source!);
    await expect(page.getByRole("button", { name: "Read text" })).toBeEnabled();
    await page.unroute(corePattern);
    await page.getByRole("button", { name: "Read text" }).click();
    await expect(
      page.getByLabel("Drawing number *", { exact: true }),
    ).toHaveValue("DWG-7428", { timeout: 60000 });
    await verify(info);
  } finally {
    held.release();
  }
});
