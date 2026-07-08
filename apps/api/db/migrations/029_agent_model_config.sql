-- 029 — Per-agent model routing config: which model each OpenClaw agent runs on
-- (Codex via openclaw, or Claude Sonnet/Opus/Haiku via the Max subscription).
-- The admin UI writes desired_model here; the HOST applier
-- (~/.openclaw/scripts/agent-model-applier.py, cron) picks up pending rows,
-- updates ~/.openclaw/platform/agent-models.json (read by agent-run.sh on every
-- invocation) and marks them applied. Idempotent.

create table if not exists sc_agent_model_config (
  agent_id      text primary key,
  desired_model text not null,               -- openai-codex/gpt-5.5 | claude/sonnet | claude/opus | claude/haiku
  status        text not null default 'pending',  -- pending | applied | error
  error         text,
  requested_by  text,                         -- admin email
  requested_at  timestamptz not null default now(),
  applied_at    timestamptz
);

alter table sc_agent_model_config enable row level security;

insert into sc_permissions (role_key, action, scope) values
  ('admin', 'admin.agents.manage', 'all')
on conflict (role_key, action) do nothing;
