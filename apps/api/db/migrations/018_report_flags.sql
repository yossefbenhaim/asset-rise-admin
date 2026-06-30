-- 018 — Per-admin report flags: pin/bookmark + internal note on a report.
-- Service-role only. One row per (report_token, admin). Idempotent.
create table if not exists sc_report_flags (
  id           uuid primary key default gen_random_uuid(),
  report_token text not null,
  admin_id     uuid references sc_profiles(id) on delete cascade,
  pinned       boolean not null default false,
  note         text,
  updated_at   timestamptz not null default now(),
  unique (report_token, admin_id)
);
create index if not exists sc_report_flags_token_idx on sc_report_flags(report_token);
alter table sc_report_flags enable row level security;
drop policy if exists sc_report_flags_service_only on sc_report_flags;
create policy sc_report_flags_service_only on sc_report_flags for all using (false) with check (false);
