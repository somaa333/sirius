import { createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import { Readable } from "node:stream";
import { supabase } from "./supabaseAdmin.js";
import { config } from "./config.js";

/**
 * Stream Storage object to a temp file (bounded RAM).
 */
export async function downloadObjectToFile(
  storagePath: string,
  destPath: string,
): Promise<void> {
  const { data: signed, error: signErr } = await supabase.storage
    .from(config.bucket)
    .createSignedUrl(storagePath, 3600);
  if (signErr || !signed?.signedUrl) {
    throw signErr ?? new Error("Could not sign storage URL");
  }

  const res = await fetch(signed.signedUrl);
  if (!res.ok || !res.body) {
    throw new Error(`Storage download failed: HTTP ${res.status}`);
  }

  const nodeReadable = Readable.fromWeb(res.body as import("stream/web").ReadableStream);
  const ws = createWriteStream(destPath);
  nodeReadable.pipe(ws);
  await finished(ws);
}
