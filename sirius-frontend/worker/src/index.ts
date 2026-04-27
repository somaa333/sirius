import "dotenv/config";
import { runWorkerLoop } from "./jobRunner.js";

const ac = new AbortController();
process.on("SIGINT", () => {
  console.log("[worker] SIGINT, shutting down…");
  ac.abort();
});
process.on("SIGTERM", () => {
  console.log("[worker] SIGTERM, shutting down…");
  ac.abort();
});

runWorkerLoop(ac.signal).catch((e) => {
  console.error("[worker] fatal", e);
  process.exit(1);
});
