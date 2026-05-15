import { claimNextJob } from "./rpc.js";
import { processCdmJob } from "./processor.js";
import { config } from "./config.js";

export async function runWorkerLoop(signal: AbortSignal): Promise<void> {
  console.log(
    `[worker] started worker_id=${config.workerId} idle=${config.idlePollMs}ms`,
  );

  while (!signal.aborted) {
    try {
      const job = await claimNextJob();
      if (!job) {
        await sleep(config.idlePollMs, signal);
        continue;
      }
      await processCdmJob(job);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown worker loop error";
      console.error("[worker] loop error:", msg);
      await sleep(config.idlePollMs, signal);
    }
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}
