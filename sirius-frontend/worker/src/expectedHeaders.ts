import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Exact CCSDS CDM CSV column set (see docs / product spec). */
export const CDM_EXPECTED_HEADERS: readonly string[] = JSON.parse(
  readFileSync(join(__dirname, "cdmExpectedHeaders.json"), "utf8"),
) as string[];

const EXPECTED_SET = new Set(CDM_EXPECTED_HEADERS);

export function validateHeaderSet(fileColumns: string[]): {
  ok: boolean;
  missing: string[];
  extra: string[];
} {
  const got = new Set(fileColumns.map((c) => String(c).trim()));
  const missing: string[] = [];
  const extra: string[] = [];
  for (const h of CDM_EXPECTED_HEADERS) {
    if (!got.has(h)) missing.push(h);
  }
  for (const h of got) {
    if (!EXPECTED_SET.has(h)) extra.push(h);
  }
  return {
    ok: missing.length === 0 && extra.length === 0 && got.size === EXPECTED_SET.size,
    missing,
    extra,
  };
}
