-- 017 — Lead funnel events (admin-owned): started-a-check / viewed-report /
-- downloaded-pdf / from-landing. Powers the Leads funnel + dashboard conversion.
-- Service-role only. Idempotent.
create table if not exists sc_lead_events (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid references sc_leads(id) on delete cascade,
  report_token text,
  lead_email   text,
  type         text not null check (type in ('started','report_viewed','pdf_downloaded','landing')),
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists sc_lead_events_type_idx  on sc_lead_events(type, created_at desc);
create index if not exists sc_lead_events_email_idx on sc_lead_events(lower(lead_email));
alter table sc_lead_events enable row level security;
drop policy if exists sc_lead_events_service_only on sc_lead_events;
create policy sc_lead_events_service_only on sc_lead_events for all using (false) with check (false);
