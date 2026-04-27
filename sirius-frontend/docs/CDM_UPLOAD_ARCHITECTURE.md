# CDM upload architecture (SIRIUS)

## Components

1. **Browser** — Validates CSV + size → uploads to Storage (`cdm-uploads`) → inserts `cdm_uploads` (`status = uploaded`, `source_type = actual`) → invokes Edge Function `validate-and-import-cdm` (queue only).
2. **Edge Function** — Auth, ownership, file exists → marks job **queued** (+ optional job event). **Does not** parse the full CSV.
3. **Worker** (`/worker`, TypeScript, Node 20+) — `claim_next_cdm_upload_job()` → streams CSV from Storage to temp file → `csv-parse` iterator → validates headers (exact schema in `worker/src/cdmExpectedHeaders.json`) → validates rows → batch inserts `cdm_records` / `cdm_validation_errors` → `update_cdm_upload_progress` + heartbeat → `finish_cdm_upload_job`.
4. **Browser** — Polls `cdm_uploads` until `validated` or `failed`; shows progress, counts, errors.

## Run the worker

```bash
cd worker
cp .env.example .env
# Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm install
npm run build
npm start
```

## Env (frontend)

`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — anon key only.

## RPC / schema drift

If Postgres RPC argument names differ, edit `worker/src/rpc.ts`. The worker falls back to direct `cdm_uploads` patches when RPC signatures omit fields.

## Large files

- No `file.text()` on the whole file.
- Two **sequential streaming passes**: (1) count data rows, (2) validate + insert. Memory stays bounded; batch sizes capped.

## GPU

Not used. Optional AI enrichment should be a separate job/module.
