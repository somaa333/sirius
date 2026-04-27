import { supabase } from "./supabaseAdmin.js";

export async function insertJobEvent(
  uploadId: string,
  eventType: string,
  message: string,
  details: Record<string, unknown> | null = null,
): Promise<void> {
  const { error } = await supabase.from("cdm_upload_job_events").insert({
    upload_id: uploadId,
    event_type: eventType,
    message,
    details,
  });
  if (error) {
    console.error(`[jobEvents] failed to insert ${eventType}:`, error.message);
  }
}
