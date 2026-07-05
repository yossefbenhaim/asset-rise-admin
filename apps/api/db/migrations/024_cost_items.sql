-- 024 — Cost dashboard: every tool/service the business spends money on,
-- current AND planned (forecast), managed from the admin. Idempotent.

create table if not exists sc_cost_items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  provider     text,
  category     text not null default 'infra',   -- infra|ai|comms|payments|marketing|legal|other
  status       text not null default 'active',  -- active|planned|cancelled
  amount       numeric not null default 0,      -- per billing period, in `currency`
  currency     text not null default 'ILS',     -- ILS|USD
  billing      text not null default 'monthly', -- monthly|annual|one_time|usage
  usage_note   text,                             -- for usage billing: the unit price story
  is_estimate  boolean not null default false,   -- true = number is an estimate, verify on bill
  expected_from date,                            -- for planned items: when it starts
  url          text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists sc_cost_items_status_idx on sc_cost_items(status);
create unique index if not exists sc_cost_items_name_uniq on sc_cost_items(name);

alter table sc_cost_items enable row level security;

insert into sc_permissions (role_key, action, scope) values
  ('admin', 'admin.costs.view',   'all'),
  ('admin', 'admin.costs.manage', 'all')
on conflict (role_key, action) do nothing;
