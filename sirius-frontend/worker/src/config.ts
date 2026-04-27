import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

export const config = {
  supabaseUrl: req("SUPABASE_URL"),
  serviceRoleKey: req("SUPABASE_SERVICE_ROLE_KEY"),
  workerId: process.env.WORKER_ID ?? "sirius-cdm-worker",
  idlePollMs: Number(process.env.IDLE_POLL_MS ?? 3000),
  heartbeatMs: Number(process.env.HEARTBEAT_MS ?? 15000),
  batchSize: Math.min(500, Math.max(50, Number(process.env.CDM_BATCH_SIZE ?? 250))),
  bucket: "cdm-uploads",
  sourceType: "actual" as const,
};
