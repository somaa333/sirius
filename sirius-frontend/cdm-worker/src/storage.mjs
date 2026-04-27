import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import { Readable } from "node:stream";
import { supabase } from "./supabase.mjs";

const BUCKET = "cdm-uploads";

/**
 * Stream object from Storage to a temp file (bounded RAM).
 * @param {string} storagePath
 * @param {string} destPath
 */
export async function downloadObjectToFile(storagePath, destPath) {
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (signErr || !signed?.signedUrl) {
    throw signErr ?? new Error("Could not sign storage URL.");
  }

  const res = await fetch(signed.signedUrl);
  if (!res.ok || !res.body) {
    throw new Error(`Storage download failed: HTTP ${res.status}`);
  }

  const nodeReadable = Readable.fromWeb(res.body);
  const ws = createWriteStream(destPath);
  nodeReadable.pipe(ws);
  await finished(ws);
}
