import { JobStore } from "./store";
import { configuration } from "./config";
process.umask(0o077);
const store = new JobStore(configuration());
let removed = 0;
for (const job of store.all())
  if (job.expires <= Date.now()) {
    store.purge(job.id);
    removed++;
  }
store.prune();
store.close();
console.log(JSON.stringify({ event: "expiry_cleanup", removed }));
