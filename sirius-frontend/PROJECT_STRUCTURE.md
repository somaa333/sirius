# Project structure (SIRIUS frontend)

Root app lives under **`sirius-frontend/`**. This document reflects the **current** layout; incremental moves toward a stricter `pages/Home/` style can be done without changing runtime behavior.

## Top level

| Path | Purpose |
|------|---------|
| `src/` | Application source |
| `public/` | Static assets served as-is |
| `worker/` | Separate CDM worker (not bundled into Vite client) |
| `supabase/` | Edge functions & SQL migrations (backend tooling) |
| `.env.example` | Template for Vite env vars |
| `vite.config.js` | Vite configuration |

## `src/`

### `src/pages/`

Route-level screens (one default export per file). Co-located CSS (`PageName.css`) where used.

Examples: `Home.jsx`, `Dashboard.jsx`, `CdmUpload.jsx`, `AnalysisPage.jsx`, `ReportsPage.jsx`, `AdminPanel.jsx`, `Profile.jsx`, `Login.jsx`, etc.

### `src/components/`

Reusable UI and layout pieces.

| Subfolder | Contents (examples) |
|-----------|------------------------|
| `dashboard/` | Dashboard shell widgets: `DashboardPageLayout`, charts, `EventsTable`, CDM upload history |
| `analysis/` | Analysis progress modal |
| `home/` | Home hero visuals |
| `space/` | Space/APOD cards |
| `toast/` | Toast provider |
| Root files | `AppShell.jsx`, `Header.jsx`, `Breadcrumbs.jsx` |

**Note:** A stricter split (`layout/`, `ui/`, `charts/`) can mirror this over time; imports must be updated together.

### `src/data/`

Data access helpers and mappers tied to domain concepts (CDM events, assessments, dashboard trends, reports). Uses **`supabaseClient`**.

### `src/services/`

HTTP clients and orchestration (FastAPI analysis, CDM upload queue, polling). See **`src/services/README.md`**.

### `src/utils/`

Pure or UI-adjacent helpers (e.g. CDM upload banner text).

### `src/constants/`

Shared constants that are not environment-driven (e.g. analysis progress step labels).

### `src/hooks/`, `src/types/`

Placeholder READMEs for future shared hooks and TS/JSDoc centralization.

### `src/config/`

Optional API keys / third-party config (e.g. NASA API for home).

### Root `src/` files

| File | Purpose |
|------|---------|
| `main.jsx` | Router + providers |
| `App.jsx` | Login route UI |
| `AuthContext.jsx` | Supabase auth state |
| `ThemeContext.jsx` | Theme preference |
| `supabaseClient.js` | Single Supabase browser client |

### Styles

- `src/index.css` — global styles
- Page/component CSS next to components or under `pages/`

## Documentation

| File | Topic |
|------|--------|
| `README.md` | Setup & commands |
| `PROJECT_STRUCTURE.md` | This file |
| `FRONTEND_ARCHITECTURE.md` | Routing, auth, modules |
