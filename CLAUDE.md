# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Rutinas del Bebé" — a mobile web app for two parents to share and log one baby's routines (tomas de leche, vitaminas, pañales, sueño) with 7-day stats. **No build step, no framework, no bundler, no package.json, no tests, no lint.** Plain HTML + CSS + vanilla JS served statically. The entire backend is Supabase (Postgres + Auth + RLS + RPC) — the `.sql` files *are* the backend.

Codebase, comments, README, and commit messages are in **Spanish**. Match that.

## Commands

There is nothing to build, lint, or test.

- **Local dev**: `cp config.example.js config.js`, fill `SUPABASE_URL` / `SUPABASE_ANON_KEY`, then open `index.html` (or serve the folder with any static server — all script paths are relative).
- **DB setup**: run `supabase.sql` in the Supabase SQL Editor. Whitelist an email so it can sign up: `insert into whitelist (email) values ('correo@ejemplo.com');`
- **Migrations**: `migracion.sql` and `actualizacion-2.sql` are cumulative *historical* scripts, **not idempotent** — do not re-run them on a fresh DB, use `supabase.sql`.
- **Deploy**: automatic on push to `main` via `.github/workflows/deploy.yml`. The workflow writes `config.js` from repo Secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) and publishes the whole repo to GitHub Pages. Pages source must be "GitHub Actions".

## Files

- `index.html` — all markup for every screen and tab exists statically; JS only toggles `.hidden` / `.active`. Loads CDN deps (supabase-js, chart.js, hammerjs, chartjs-plugin-zoom), then `config.js`, then `app.js`.
- `app.js` (~1150 lines) — the entire application, vanilla JS, all top-level, organized by comment banners (Helpers, Estado, Datos, Render de tablas, Gráficos, Tabs, Formularios, Edición, Tema, Configuración, Autenticación, Vincular bebé, Entrada, Fondo animado, Inicio).
- `styles.css` — theming via CSS custom properties keyed off `data-theme` (dark/light) and `data-palette` (5 palettes) on `<html>`.
- `config.js` (gitignored) — sets `window.ENV`. `app.js` has a hardcoded fallback Supabase URL + anon key used if `config.js` is absent (public by design, protected by RLS).
- `supabase.sql` — full schema. `migracion.sql` / `actualizacion-2.sql` — historical migrations.

## Data flow

Single client `db`. Global mutable state: `cache` (`tomas`/`vitaminas`/`panales`/`sueno` arrays), `bebe`, `miRol`, `usuario`, `currentTab`, `statsDirty`. Generic helpers: `fetchTable`/`loadAll` (SELECT ordered, limit 500), `insertar` (auto-injects `bebe_id`), `eliminar`. After any write the affected table is re-fetched wholesale into `cache` and `statsDirty=true`. Every query filters by `bebe.id`; RLS enforces the same server-side.

Auth entry is `db.auth.onAuthStateChange` → `entrar(session)`: look up the `miembros` row; none → show `#linkScreen`, else load `bebes` → `iniciarApp()`. Signup is gated by the `email_autorizado` RPC (friendly error) plus a `validar_whitelist()` trigger on `auth.users` (hard block).

Backend RLS routes all access through the `security definer` function `mis_bebes()` (avoids policy recursion). RPCs the frontend calls: `crear_bebe`, `unirse_bebe`, `email_autorizado`. Model: `miembros` PK is `user_id`, so one baby per user, max two per baby (madre/padre).

## Non-obvious patterns

- **Tabs**: all 5 sections live in the DOM; `renderTab()` lazily re-renders only the active one. Stats charts only rebuild when `statsDirty`.
- **History tables**: one generic `tablaHTML()` builds all four. Rows grouped by day (`groupByDay` / `fmtDayLabel` → Hoy/Ayer/fecha). Edit (✏️) and delete (🗑) carry `data-tabla`/`data-id`; a single document-level click delegator dispatches to `abrirEdicion`/`eliminar`. The edit modal builds different fields per table.
- **Sleep across midnight**: `tramosPorDia()` splits a session at each midnight so each day counts only its own hours. Overnight handling adds 24h when wake-time ≤ sleep-time. A live nap is a row with `fin` null (excluded from totals); "Se durmió"/"Despertó" insert/update it.
- **Day navigation** is not a calendar — date/time inputs default to now (`setNowDefaults()`) but accept any date, so records land in past/future days and re-group automatically.
- **Photo**: chosen file is resized client-side to 256px and stored as a base64 JPEG in `bebes.foto_base64` (no storage bucket).
- **Charts** are destroyed and rebuilt on every render; two modes (`semana` / `diario`) toggled via `statsMode`.
