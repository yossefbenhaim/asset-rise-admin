# Asset Rise Admin — Project Guide for Claude

Internal CRM/ops dashboard that manages **Asset Rise** (the customer-facing app at `~/silver-castle`). Live at https://admin.byclick.co.il. Hebrew RTL UI, dark theme, admin-only.

> **Sibling app — don't confuse**: `~/silver-castle` is the customer product (asset-rise.byclick.co.il). This repo only ADMINISTERS its data. Separate repo / Coolify app (`a2g8zsq45h19x8790xvt9wz9`) / docker network. Containers are named `api-a2g8*` / `web-a2g8*`.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React + TS + Tailwind (dark admin theme, cmdk, charts/DataTable) |
| Backend | Express + tRPC + Zod + Supabase JS (service role) |
| Shared | `@asset-rise/shared` — Zod schemas + TS types for both ends (NOT the same package as silver-castle's — same name, separate copy) |
| DB | The SAME self-hosted Supabase as Asset Rise (`supabase.byclick.co.il`). Reads `sc_*`; owns `sc_admin_profiles`, `sc_leads`, `ar_migrations` + admin-specific `sc_*` tables |
| Auth | email+password (GoTrue), NO OAuth. Admins provisioned manually. Roles: `admin` / `admin.support` / `admin.sales` |
| Deploy | Coolify UI (or `queue_application_deployment` in tinker). Verify `curl -sI https://admin.byclick.co.il` → 200 |
| Git | github.com/yossefbenhaim/asset-rise-admin, branch `main` |

## Repository layout

Monorepo mirroring silver-castle: `apps/api` (tRPC routers + `repos/` for DB) · `apps/web` (pages in `pages/admin/`, god-mode modules in `pages/admin/god/`) · `packages/shared` (schemas + types, single barrel `src/index.ts`).

## Code standards — machine-enforced

One gate: **`npm run check`** = boundaries (dependency-cruiser) + `npm run lint` (ESLint) + `npm run format:check` (Prettier). Runs inside root `npm run build`; must pass with **0 errors**.

| Standard | Rule | Enforced by |
|---|---|---|
| Style | single quotes, no semi, 100 cols — run `npm run format`, never hand-format | Prettier (`.prettierrc.json`) |
| File size | **hard error over 600 lines**; aim under 300; split big pages into feature components | ESLint `max-lines` |
| Legacy oversized | 9 files predate the budget — capped at 900, may only shrink; **never add to the list** | `eslint.config.mjs` `LEGACY_OVERSIZED` |
| React hooks | no conditional hooks; deps warnings | eslint-plugin-react-hooks |
| Boundaries | `shared` never imports apps; api↔web never import each other (tRPC `AppRouter` type-only re-export excepted); `@asset-rise/shared` via barrel only — no deep paths | dependency-cruiser |

Baselines (don't regress): api + web typecheck = **0 errors** (`npm run typecheck:api` / `typecheck:web`); ESLint warnings = 8.

## Conventions

- Code & commands in English; user-facing copy in Hebrew (RTL).
- Only touch `sc_*` tables (+ `ar_migrations`). The Supabase is shared with Asset Rise + SmartBudget — see `~/CLAUDE.md`.
- Migrations tracked in `ar_migrations` ledger (unlike silver-castle's run-every-boot model). GOTCHA: the ledger blocks re-seeding — if admin pages 403, re-apply perm migrations 003/006/009-013 via psql.
- New schema → `packages/shared/src/schemas/` + re-export from the barrel (`src/index.ts`) — deep imports fail the boundary check.
- After code changes: build, deploy via Coolify, verify 200 (never `docker compose up` directly).
