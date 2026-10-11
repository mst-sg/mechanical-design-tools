import { configuration } from "./config";
import { createJobService } from "./app";
process.umask(0o077);
const config = configuration();
if (
  process.env.NODE_ENV === "production" &&
  !config.origin.startsWith("https://")
)
  throw new Error("An explicit HTTPS origin is required");
const app = createJobService(config);
const port = Number(process.env.MST_JOBS_PORT || 4174);
app.server.listen(port, "127.0.0.1", () =>
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
