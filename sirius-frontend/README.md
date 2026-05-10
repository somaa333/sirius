# SIRIUS (Frontend)

Web client for **SIRIUS** — a space/CDM risk analysis experience built with **React**, **Vite**, and **Supabase**. The Analysis feature calls an external **FastAPI** service for model runs.

## Tech stack

- **React 19** + **React Router**
- **Vite 7**
- **Supabase JS** (auth + Postgres/realtime as configured)
- **Lucide React**, **Recharts**, **jsPDF** (reports), **Framer Motion** / **GSAP** (selected UI)

## Prerequisites

- **Node.js** (LTS recommended)
- **npm**
- A **Supabase** project (URL + anon/publishable key)
- **FastAPI** analysis API URL (for `/analysis`)

## Setup

1. Clone the repo and enter this directory:

   ```bash
   cd sirius-frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Environment variables — copy the example file and fill in values:

   ```bash
   copy .env.example .env
   ```

   Required variables (see `.env.example`):

   | Variable | Purpose |
   |----------|---------|
   | `VITE_SUPABASE_URL` | Supabase project URL |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public client key |
   | `VITE_AI_API_BASE_URL` | Base URL for FastAPI (no trailing slash required in code) |

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (HMR) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | ESLint |

Optional workspace scripts (see `package.json`): `worker:*` for the CDM worker package under `worker/`.

## Documentation

- **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)** — folder layout and responsibilities
- **[FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md)** — routing, auth, Supabase, and major modules

## Related packages in this repo

- `worker/` — CDM processing worker (separate Node app)
- `supabase/functions/` — Edge functions (deployed via Supabase CLI)
