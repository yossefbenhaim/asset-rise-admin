-- 023 — Outreach center: B2B sales targets (organizers/developers/lawyers)
-- managed from the admin CRM. Seeded from the public-sources 100-target list;
-- Yossef adds/edits people, tracks call status, and edits per-target drafts.
-- Idempotent.

create table if not exists sc_outreach_targets (
  id               uuid primary key default gen_random_uuid(),
  rank             int,
  name             text not null,
  type             text not null default 'organizer',      -- organizer|developer|lawyer|other
  city_region      text,
  evidence         text,                                    -- why they're a fit (public info)
  source_url       text,
  phone            text,
  email            text,
  public_contact   text,                                    -- free-form original contact line
  pitch_angle      text,                                    -- the personalized opening angle
  suggested_deck   text,                                    -- persona deck filename
  draft_message    text,                                    -- editable outreach draft (Hebrew)
  status           text not null default 'new',             -- new|approached|call_scheduled|called|gave_addresses|pilot|customer|not_relevant
  notes            text,
  next_followup_at timestamptz,
  last_contact_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists sc_outreach_targets_status_idx on sc_outreach_targets(status);
create index if not exists sc_outreach_targets_followup_idx on sc_outreach_targets(next_followup_at);
create unique index if not exists sc_outreach_targets_name_uniq on sc_outreach_targets(name);

alter table sc_outreach_targets enable row level security;

-- admin-service-role access only (admin api uses service key; no anon policies)

insert into sc_permissions (role_key, action, scope) values
  ('admin',       'admin.outreach.view',   'all'),
  ('admin',       'admin.outreach.manage', 'all'),
  ('admin.sales', 'admin.outreach.view',   'all'),
  ('admin.sales', 'admin.outreach.manage', 'all')
on conflict (role_key, action) do nothing;
