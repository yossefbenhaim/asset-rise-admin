-- 019 — AI prompt store: editable prompt text per RESEARCH_VERSION.
-- Edited from the admin (admin.ai.edit_prompt, super-only) and read by the host
-- analyzer worker so prompt tweaks ship without a code deploy. Service-role
-- only. One row per version. Idempotent.
--
-- ⚠ SECURITY CONTRACT (Shield 2026-06-30, MEDIUM): `text` is UNTRUSTED
-- operator-provided content. The host analyzer worker (~/analyzer-codex-worker.sh)
-- does NOT read this table yet. BEFORE wiring the worker to consume it, the worker
-- MUST treat `text` as DATA/rubric only — quoted + fenced inside a fixed,
-- code-owned instruction harness, with the non-negotiable JSON-only output
-- contract and tool/file/secret restrictions OUTSIDE the stored text and enforced
-- by schema validation (block, not log-only). Never concatenate `text` as live
-- agent instructions. Editing stays super-admin-only.
create table if not exists sc_ai_prompts (
  version     text primary key,        -- 'v10', 'v11', …
  text        text not null default '',
  note        text,
  updated_by  uuid references sc_profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
create index if not exists sc_ai_prompts_updated_at_idx on sc_ai_prompts(updated_at desc);
alter table sc_ai_prompts enable row level security;
drop policy if exists sc_ai_prompts_service_only on sc_ai_prompts;
create policy sc_ai_prompts_service_only on sc_ai_prompts for all using (false) with check (false);
