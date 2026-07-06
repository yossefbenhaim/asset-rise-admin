-- 025 — Agents Center: read-only dashboard of the whole OpenClaw agent estate.
-- Snapshot tables written by the HOST collector ~/.openclaw/scripts/agents-center-sync.py
-- (containers have no access to ~/.openclaw, so the host pushes; admin only reads).
-- Idempotent. NOTE: never `create extension` in a migration (aborts the run).

create table if not exists sc_agent_registry (
  id               text primary key,             -- openclaw agent id / slug (main, fury, vision, ...)
  name             text not null,                -- display name (Jarvis, Fury, ...)
  emoji            text,
  team             text not null default 'ops',  -- command|dev|growth|marketing|ops|legal|product
  role_title       text not null,
  purpose          text,
  guardrails       text,                          -- forbidden / approval rules (from registry card)
  model            text,
  fallback_model   text,
  status           text not null default 'active',-- active|semi-active|frozen|archived|worker
  version          text,                          -- semver from platform/agent-versions.json
  version_why      text,                          -- why this version/model assignment
  version_history  jsonb not null default '[]'::jsonb,  -- [{version,date,note}]
  workspace        text,
  telegram_bound   boolean not null default false,
  key_files        jsonb not null default '[]'::jsonb,
  discrepancies    jsonb not null default '[]'::jsonb,  -- ["card says X but cron says Y", ...]
  sessions_count   integer,
  last_activity_at timestamptz,
  synced_at        timestamptz not null default now()
);

create table if not exists sc_agent_skills (
  id           uuid primary key default gen_random_uuid(),
  agent_id     text not null,
  name         text not null,
  path         text,
  description  text,
  origin       text,          -- repo/local per installed-skills-manifest
  scan_verdict text,          -- security-scan verdict from the manifest
  status       text not null default 'active',
  content      text,          -- SKILL.md content (capped by the collector)
  synced_at    timestamptz not null default now(),
  unique (agent_id, name)
);
create index if not exists sc_agent_skills_agent_idx on sc_agent_skills(agent_id);

create table if not exists sc_agent_docs (
  id          uuid primary key default gen_random_uuid(),
  agent_id    text not null,
  title       text not null,
  path        text not null,
  kind        text not null default 'doc',  -- identity|deliverable|report|legal-draft|card|ledger|health
  size_bytes  bigint,
  modified_at timestamptz,
  content     text,                          -- capped by the collector
  synced_at   timestamptz not null default now(),
  unique (agent_id, path)
);
create index if not exists sc_agent_docs_agent_idx on sc_agent_docs(agent_id);

create table if not exists sc_agent_activity (
  id       uuid primary key default gen_random_uuid(),
  agent_id text not null,
  at       timestamptz not null,
  kind     text not null,   -- approval|decision|report|session|cron|health
  title    text not null,
  detail   text,
  source   text,
  unique (agent_id, at, kind, title)
);
create index if not exists sc_agent_activity_agent_idx on sc_agent_activity(agent_id, at desc);

create table if not exists sc_agent_crons (
  id          uuid primary key default gen_random_uuid(),
  agent_id    text not null,
  schedule    text not null,     -- human-readable schedule
  description text not null,
  kind        text not null default 'user-cron',  -- openclaw-cron|user-cron|systemd
  enabled     boolean not null default true,
  last_status text,
  synced_at   timestamptz not null default now(),
  unique (agent_id, description)
);
create index if not exists sc_agent_crons_agent_idx on sc_agent_crons(agent_id);

alter table sc_agent_registry enable row level security;
alter table sc_agent_skills   enable row level security;
alter table sc_agent_docs     enable row level security;
alter table sc_agent_activity enable row level security;
alter table sc_agent_crons    enable row level security;

insert into sc_permissions (role_key, action, scope) values
  ('admin',         'admin.agents.view', 'all'),
  ('admin.support', 'admin.agents.view', 'all')
on conflict (role_key, action) do nothing;
