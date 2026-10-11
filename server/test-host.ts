// Local/CI harness only. Production starts server-dist/main.mjs.
import { resolve } from "node:path";
import { createJobService } from "./app";
import { configuration } from "./config";
import { paddleDouble } from "../tests/fixtures/paddle-double";
if (process.env.NODE_ENV === "production")
  throw new Error("Test host cannot serve production");
const paddle = await paddleDouble();
const app = createJobService(
  configuration({
    dataDir: resolve(".artifacts/job-service"),
    hourlyLimit: 1000,
    paddleUrl: paddle.url,
    paddleToken: paddle.token,
    maxStoredBytes: 2 * 1024 * 1024 * 1024,
  }),
);
app.server.listen(4174, "127.0.0.1");
process.on("SIGTERM", async () => {
  await app.close();
  await paddle.close();
  process.exit(0);
});
