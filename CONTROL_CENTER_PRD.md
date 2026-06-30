# Asset Rise Admin — Control Center · Feedback Round 2 PRD

Phased work plan from Yossef's review (2026-06-30). Execute **one phase at a time**,
verify (tsc 0 + vite build + endpoint smoke) and deploy after each, then move on.
Repos: `~/asset-rise-admin` (admin) + `~/silver-castle` (customer pipeline/worker).

---

## Phase 1 — Processing Monitor: truly live + accurate (no manual refresh)
**Problem:** big delay; a request that already finished (score returned) still shows
"stage 3"; the same item appears **twice** (looks broken); only updates on refresh.
**Do:**
1. **Live push, no refresh** — subscribe via **Supabase Realtime** (`postgres_changes`)
   on `sc_analyzer_jobs` + `sc_report_runs`; on any change → invalidate/refetch
   `processing.live` (and a short 4s safety poll as fallback). The admin already has a
   supabase client. (RabbitMQ would need a browser bridge — Supabase Realtime is the
   right fit; no new infra.)
2. **Kill the double-display** — an item must appear in exactly ONE bucket. Dedupe
   running-job vs its run; don't show a research job as "running" once its `sc_report_runs`
   row is `completed`. De-dup `recentDone`(jobs) vs `recentRuns`(runs) by address/key.
3. **Accurate stage** — stop the 12s/stage heuristic from claiming "stage 3" on a done
   request. Drive the stage from REAL signals: a finished run → all stages done; a
   failed run → mark the failed stage. Add a lightweight `stage`/`progress` the worker
   stamps on `sc_analyzer_jobs` as it advances (best-effort) so "running" reflects reality.
**Verify:** trigger a fresh (non-cached) search → watch the monitor advance live and land
on "done" within seconds, no refresh, no duplicate row.

## Phase 2 — AI Control split per agent (Analyzer + Wong), each with prompt versions
**Problem:** wants a separate sidebar entry for **Analyzer** and for **Wong**; each with its
own prompt-version management (like Analyzer has); clicking a version must SHOW the actual
prompt content; identical UI for both agents.
**Do:**
1. `sc_ai_prompts` gains an `agent` column (`analyzer` | `wong`); versions are per-agent.
2. Sidebar: `/ai` (Analyzer — summaries + its prompt versions) and `/wong` (Wong — doc
   verifications + its prompt versions). Reuse ONE shared `PromptVersionsPanel` for both.
3. Clicking a version shows the **actual prompt text** (the base prompt of that agent +
   any stored override), readable, with compare. Surface the live base prompt of each
   worker (analyzer build_prompt / document-verify prompt) read-only so "what's there" is visible.
**Verify:** both screens show version list; clicking a version reveals its prompt content.

## Phase 3 — Sources catalog layout
**Problem:** the full catalog rows spread across the whole screen; want square cards side by
side, in the SAME order/style as the live health grid on top.
**Do:** render the catalog as a responsive grid of equal cards (like the health grid), same
ordering, no full-width rows.

## Phase 4 — god/Buildings: full edit + emphasized open
**Problem:** wants the "open" button emphasized + FULL editing of everything about a building:
replace vaad, edit address, move stage, upload a document — everything.
**Do:** emphasize the open/detail button (real Button); in the building detail add edit
actions (reuse existing god mutations: force_stage, reassign_role/set_vaad, building.update
for address; add document-upload if a god doc mutation exists, else note). Audited.
**Verify:** can open a building and perform each edit action.

## Phase 5 — Documents: view the doc + storage-migration plan
**Problem:** clicking a documents table row should show the actual document; and produce a
PLAN to migrate document storage from the `silver-castle/` prefix to an `asset-rise/` prefix.
**Do:** row-click → open/preview the document (signed URL). Write a separate migration plan
doc (`STORAGE_MIGRATION_PLAN.md`) covering: copy objects `silver-castle/…` → `asset-rise/…`,
rewrite stored paths in `sc_*` rows, keep old links working (dual-read / redirect), rollback.
Discuss with Yossef before executing the migration.

## Phase 6 (LAST) — Table UI consistency (cross-cutting)
**Problem:** inconsistent — some tables open via an "open" button, some via row click.
**Do:** make EVERY table uniform: **row click opens** the detail, **hover highlight** on the
row, **pointer cursor**, clickable. Apply across Reports/Users/Payments/Logs/Wong/Sources/etc.
(the shared DataTable already supports onRowClick — standardize all call sites + the row style).
**Verify:** every table behaves identically (hover + row-click).

---

### Conventions (all phases)
- Tokens only (--sc-*), full RTL, dark-mode, framer-motion. tsc gate: web/api 0 errors + vite build green.
- Customer-pipeline edits = fire-and-forget, never break a serve. Deploy admin via Coolify
  (`a2g8zsq45h19x8790xvt9wz9`); customer via `sudo ~/auto-deploy-silver-castle.sh`.
- Re-run Shield if a phase adds a write path / new external surface.
- Deferred (separate): real Stripe/PayPal payments.
