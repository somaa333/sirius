# SIRIUS CDM import worker (production)

Node.js **20+** service that claims queued `cdm_uploads` jobs, **streams** CSV from Storage (temp file + `csv-parse` iterator), validates rows with bounded memory, batch-writes `cdm_records` / `cdm_validation_errors`, updates **progress + heartbeat**, and finishes via `finish_cdm_upload_job`.

## Environment

Copy `.env.example` to `.env`:

- `SUPABASE_URL` — project URL  
- `SUPABASE_SERVICE_ROLE_KEY` — **service role only** (never in browser)  
- `WORKER_ID` — optional instance id  
- `IDLE_POLL_MS` — poll when no job (default `3000`)  
- `HEARTBEAT_MS` — `last_heartbeat_at` interval (default `15000`)  
- `CDM_BATCH_SIZE` — insert batch size (default `250`, clamped 50–500)

## Commands

```bash
cd worker
npm install
npm run build
npm start
```

Development (TypeScript directly):

```bash
npm run dev
```

## Database alignment

- RPCs: `claim_next_cdm_upload_job`, `update_cdm_upload_progress`, `finish_cdm_upload_job`  
- If RPC args differ, edit `src/rpc.ts` (fallback `patch` on `cdm_uploads` uses service role).  
- Expected CSV columns: `src/cdmExpectedHeaders.json` (must match CCSDS export).

## Limitations

- Two sequential reads of the file: (1) row count, (2) validation — both **streamed**, memory bounded.  
- Per-row retry on unique violation only when a batch insert fails — rare path.

## GPU

CSV validation is CPU/streaming only. Optional future **AI enrichment** should be a separate module/job, not this import pipeline.
