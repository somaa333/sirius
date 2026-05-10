# `services/`

**Network and integration boundaries** for the SIRIUS frontend.

| File / area | Role |
|-------------|------|
| `analysisApi.js` | HTTP calls to the FastAPI analysis service (`VITE_AI_API_BASE_URL`). |
| `cdmUploadApi.js` | Supabase queries for CDM upload jobs, validation errors, and related reads. |
| `cdmUploadQueue.js` | Client-side upload: storage, edge function invocation, progress callbacks. |
| `cdmUploadPolling.js` | Polls upload job row until a terminal status. |
| `supabaseEdgeSession.js` | Session handling for edge/queue requests when needed. |

The shared Supabase browser client is **`src/supabaseClient.js`** (one instance for the app).
