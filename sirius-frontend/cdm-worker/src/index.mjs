import "dotenv/config";
import { claimNextJob } from "./rpc.mjs";
import { runClaimedJob } from "./processJob.mjs";

const IDLE_MS = Number(process.env.IDLE_POLL_MS ?? 3000);

async function loop() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await new Promise((r) => setTimeout(r, IDLE_MS));
        continue;
      }
      await runClaimedJob(job);
    } catch (e) {
      console.error("worker loop error", e);
      await new Promise((r) => setTimeout(r, IDLE_MS));
    }
  }
}

console.log("SIRIUS CDM worker starting…");
loop();
