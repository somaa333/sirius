# Frontend architecture (SIRIUS)

High-level map of routing, authentication, data access, and major features. **Behavior is implemented in source files**; this doc stays in sync conceptually.

## Routing

Defined in **`src/main.jsx`** inside `BrowserRouter`:

| Path | Screen |
|------|--------|
| `/` | Home |
| `/login` | Login (outside `AppShell`) |
| `/reset-password` | Password recovery flow |
| `/dashboard` | Dashboard |
| `/dashboard/events/:eventId` and `/dashboard/cdm-events/:eventId` | CDM event detail (aliases) |
| `/cdm-upload` | Upload CDM |
| `/analysis` | Analysis (actual / predicted paths) |
| `/analysis/:assessmentId` | Assessment detail |
| `/reports` | Reports |
| `/admin` | Admin panel |
| `/profile` | Profile |

Layout wrapper **`AppShell`** (`src/components/AppShell.jsx`) provides the main **`Header`** for authenticated-style routes.

## Authentication

- **`AuthProvider`** (`src/AuthContext.jsx`) wraps the app.
- Uses **`supabase.auth`** from **`src/supabaseClient.js`**: persisted session, refresh, PKCE, URL detection for recovery/OAuth.
- Pages that require a session check `useAuth()` and redirect (e.g. to `/`) when unauthenticated.

## Supabase usage

- **One client**: `createClient` in `supabaseClient.js` with URL/key from `import.meta.env`.
- **`src/data/*`**: reads/writes for CDM events, assessments, trends, reports — **no schema changes** are implied by this doc.
- **`src/services/cdmUpload*.js`**: uploads, queue triggers, polling job rows.

## External APIs

- **FastAPI analysis** — `src/services/analysisApi.js` uses `VITE_AI_API_BASE_URL` for `POST /analyze/actual/:eventId` and `POST /analyze/predicted/:eventId`.
- **NASA / space** (optional) — `src/config/spaceApi.js` may use `VITE_NASA_API_KEY` for home content.

## Major modules

### Home (`/`)

Marketing-style landing; breadcrumbs optional; uses home/space components.

### Dashboard (`/dashboard`)

Event summaries, filters, CDM event table, navigation into event detail.

### Upload CDM (`/cdm-upload`)

File upload, queue/progress UX, upload history, validation details modal. Uses **`cdmUploadQueue`**, **`cdmUploadPolling`**, **`cdmUploadApi`**.

### Analysis (`/analysis`)

User selects **Actual** vs **Predicted** path, picks an event, runs analysis via **FastAPI**. Progress UI reuses **Upload CDM** progress styling (`CdmUpload.css` classes). Results refresh assessments lists; detail view at **`/analysis/:assessmentId`**.

### Reports (`/reports`)

Report generation (risk summary, CDM event summary), PDF/CSV export, history stored via Supabase **`reports`** table — see **`src/data/reportsData.js`**.

### Admin Panel (`/admin`)

Operator/admin UI (`AdminPanel.jsx` + `components/admin/`).

### Profile (`/profile`)

User profile and related settings.

---

For folder inventory, see **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)**.
