# Asset Rise Admin — Customer Progress Center + System Chat · PRD

Goal: from the admin, see exactly where every stakeholder (tenant / vaad /
developer / coordinator / provider) and every building stands across the 14
project stages — which tasks each must do, what's done, and **where they're
stuck** — and reach out to help via a **two-way system chat** with pre-set
templates. Same logic/architecture for every user type and for the building
(the project itself).

Repos: `~/asset-rise-admin` (admin) + `~/silver-castle` (customer).
Shared Supabase, `sc_*` tables. STUCK threshold = **7 days** (no movement /
overdue / sitting at a stage).

## Data model (already exists — read-only for Phase 1)
- 14 stages: `PROJECT_STAGES` / `PROJECT_STAGE_IDS`; `sc_projects.current_stage`
  + `completed_stages[]`.
- Tasks: `sc_project_tasks` (stage_id, owner_role, owner_user_id, status,
  due_at, completed_at, created_at, updated_at, requires_doc).
- Roles per building: `sc_tenant_profiles` (building_id + vaad booleans);
  `sc_project_providers` (project_id, provider_id, role_in_project) + provider_type;
  baton holder via `sc_projects.active_*_id` + stage.
- Stuck signals: task not done + (created_at|updated_at older than 7d) or
  `due_at < now`; building stage-dwell = now − last `project.stage.*` audit event.

---

## Phase 1 — Progress visibility & stuck detection (admin-only, NO migration)
Backend (`asset-rise-admin`): new `god.progress` router + `godProgress.repo`:
- `buildingProgress(building_id)` → 14-stage statuses (done/current/upcoming) +
  per-stage task done/total + stage dwell days + roster + baton holder.
- `userProgress(user_id)` → the user's building/project, stage statuses, and the
  user's tasks grouped by stage (status + due + completed + `stuck`), totals.
- `stuckOverview()` → every stuck task across all projects, joined to
  owner/building/stage, grouped for a proactive "who needs help" view.
UI: a "התקדמות ומשימות" section inside the existing god Tenants / Providers /
Buildings detail modals (14-stage strip + tasks-by-stage + stuck flags), and a
new **"תקיעות"** overview screen.

## Phase 2 — Two-way system chat (both repos, migration)
- Migration (silver-castle, idempotent): `sc_support_threads` (one per user) +
  `sc_support_messages` (sender_kind admin|user, body, read_at) + RLS (user sees
  /writes own; service-role full) + realtime publication.
- Customer (`silver-castle`): `support` router (myThread / send / markRead) + a
  "תמיכה / הודעות מהמערכת" chat surface + a `sc_notifications` ping on new admin
  message.
- Admin: `god.support` router (thread(user_id) / send / list-unread) + a chat
  panel embedded in the Tenants/Providers detail modals, with a **template
  picker** (shared `messageTemplates` constant, role/situation-aware,
  `{{name}}`/`{{stage}}` placeholders) — e.g. "ראינו שנתקעת בשלב X מעל שבוע…".
- Open-chat entry points from the stuck overview + each user's progress section.

## Conventions
Tokens only, RTL, the unified centered `Modal`. Admin deploy via Coolify
`a2g8zsq45h19x8790xvt9wz9`; customer via `sudo ~/auto-deploy-silver-castle.sh`.
god reads = `requireLevel('admin.super')`; writes via `godMutation` (audited).
Customer migration MUST be idempotent (no ledger there). tsc gate: admin 0 /
customer no-new-errors over baseline; vite build green. Verify 200 after deploy.
