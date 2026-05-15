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
  const msg = e instanceof Error ? e.message : "Unknown fatal error";
  console.error("[worker] fatal:", msg);
  process.exit(1);
});
