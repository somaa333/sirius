# `validate-and-import-cdm`

This folder is a **reference** Edge Function with the auth logging and manual `getUser()` pattern described in the product requirements.

- If your real implementation lives only on Supabase (not in this repo), **copy** the logging and `config.toml` notes into your deployed function—do not deploy this stub over production queue logic without merging.
- Set `[functions.validate-and-import-cdm] verify_jwt = false` in `supabase/config.toml` (see parent folder) when gateway JWT verification blocks requests before your handler runs.
