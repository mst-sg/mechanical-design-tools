// CI contract double only. It performs no OCR and cannot prove GPU accuracy.
// The separate production gate must recognize the real owned PNG/PDF fixtures.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import type { Word } from "../../src/types";
export async function paddleDouble(delayFirstMs = 0) {
  let busy = false,
    calls = 0;
  const token = randomBytes(32).toString("hex");
  const server = createServer(async (req, res) => {
    if (req.url !== "/ocr" || req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(403).end();
      return;
    }
    if (busy) {
      res.writeHead(503).end();
      return;
    }
    busy = true;
    calls++;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    if (calls === 1 && delayFirstMs)
      await new Promise((r) => setTimeout(r, delayFirstMs));
    busy = false;
    const png = Buffer.concat(chunks);
    if (png.length < 24 || png.toString("ascii", 12, 16) !== "IHDR") {
      res.writeHead(422).end();
      return;
    }
    const w = png.readUInt32BE(16),
      h = png.readUInt32BE(20);
    // The 900x500 label-free illustration exercises the empty-result path.
    const cells =
      w === 900 && h === 500
        ? []
        : [
            ["Item", "Part number", "Description", "Qty", "Material"],
            ["1", "BRK-100", "Mounting bracket", "1", "Steel"],
            ["2", "PIN-020", "Dowel pin", "2", "Steel"],
            ["3", "SCR-M6", "Socket screw", "4", "Steel"],
            ["4", "WSH-M6", "Flat washer", "4", "Steel"],
            ["5", "NUT-M6", "Hex nut", "4", "Steel"],
          ];
    const words: Word[] = cells.flatMap((row, r) =>
      row.map((text, c) => ({
        text,
        x: [20, 100, 320, 560, 650][c],
        y: 20 + r * 45,
        width: Math.min(text.length * 10, 180),
        height: 20,
        confidence: 99,
      })),
    );
    res.writeHead(200, { "Content-Type": "application/json" }).end(
      JSON.stringify({
        words,
        engine: {
          name: "PaddleOCR",
          version: "CI-double",
          model: "synthetic-contract-only",
          device: "gpu:0",
        },
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("fixture binding failed");
  return {
    url: `http://127.0.0.1:${address.port}`,
    token,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      ),
  };
}
