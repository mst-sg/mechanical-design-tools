import { configuration } from "./config";
import { createJobService } from "./app";
process.umask(0o077);
const config = configuration();
if (
  process.env.NODE_ENV === "production" &&
  (!config.origin.startsWith("https://") ||
    config.gatewayToken.length < 32 ||
    !config.gatewayAddress ||
    config.paddleToken.length < 32 ||
    !config.trustProxy)
)
  throw new Error(
    "Production requires HTTPS origin, authenticated gateway and private PaddleOCR configuration",
  );
if (!Number.isFinite(config.retentionMs) || config.retentionMs < 0)
  throw new Error("Invalid file retention policy");
const app = createJobService(config);
const port = Number(process.env.MST_JOBS_PORT || 4174);
app.server.listen(port, process.env.MST_JOBS_BIND || "127.0.0.1", () =>
  console.log(
    JSON.stringify({ service: "mst-tools-jobs", event: "ready", port }),
  ),
);
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await app.close();
    process.exit(0);
  });
