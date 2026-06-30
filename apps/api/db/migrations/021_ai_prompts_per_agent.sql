-- 021 — per-agent prompt versions (analyzer | wong). Adds `agent`, repoints
-- uniqueness to (agent, version). Idempotent.
alter table sc_ai_prompts add column if not exists agent text not null default 'analyzer';
alter table sc_ai_prompts drop constraint if exists sc_ai_prompts_pkey;
create unique index if not exists sc_ai_prompts_agent_version_uidx on sc_ai_prompts(agent, version);
