# SIRIUS CDM background worker

Node.js service that **claims** queued uploads from `cdm_uploads`, **streams** CSV from Supabase Storage to disk, validates rows incrementally, writes to `cdm_records` / `cdm_validation_errors`, and calls `update_cdm_upload_progress` / `finish_cdm_upload_job`.

## Prerequisites

- Supabase project with RPCs: `claim_next_cdm_upload_job`, `update_cdm_upload_progress`, `finish_cdm_upload_job` (parameter names must match `src/rpc.mjs` or edit that file).
- Tables: `cdm_uploads`, `cdm_records`, `cdm_validation_errors`, `cdm_upload_job_events`.
- Storage bucket `cdm-uploads` (private); worker uses **service role** to sign URLs and read objects.
- **Never** commit `.env` or expose `SUPABASE_SERVICE_ROLE_KEY` in the browser.

## Setup

```bash
cd cdm-worker
cp .env.example .env
# Edit .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, optional WORKER_ID
npm install
npm start
```

## Deployment

- Run as a **long-lived process** (systemd, Docker, Kubernetes, Fly.io, Railway, etc.).
- Scale horizontally only if `claim_next_cdm_upload_job` is concurrency-safe (typically one worker per job via locking).

## RPC parameter names

If your SQL functions use different argument names, update `cdm-worker/src/rpc.mjs` to match.

## Frontend vs worker

- **Browser**: uploads file, inserts `cdm_uploads` with `status = uploaded`, invokes Edge Function to **queue** only, then **polls** `cdm_uploads`.
- **Edge Function**: auth + ownership + mark `queued` (per your backend).
- **This worker**: performs heavy CSV processing off the request path.
