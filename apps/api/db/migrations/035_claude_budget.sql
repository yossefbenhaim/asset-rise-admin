-- 035 — Claude quota snapshot for the admin top bar. A host cron (which can read
-- ~/.claude via ccusage; the container cannot) upserts the single row; the admin
-- API reads it. Idempotent. Service-role writes only (RLS on, no public policy).
create table if not exists sc_claude_budget (
  id smallint primary key default 1 check (id = 1),
  session_used_tokens bigint not null default 0,
  session_reset_at timestamptz,
  session_cap_m int not null default 120,
  week_opus_tokens bigint not null default 0,
  week_sonnet_tokens bigint not null default 0,
  week_haiku_tokens bigint not null default 0,
  week_opus_cap_m int not null default 40,
  week_sonnet_cap_m int not null default 200,
  week_haiku_cap_m int not null default 500,
  updated_at timestamptz not null default now()
);
alter table sc_claude_budget enable row level security;
