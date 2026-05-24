-- 002 — sc_leads (CRM lead inbox from marketing sites).
-- Anonymous visitors submit a contact form → row inserted by publicProcedure
-- running with adminClient (service-role). Admins read/manage via gated tRPC
-- procedures. RLS enabled but only service-role can touch the table.

create table if not exists sc_leads (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  phone             text not null,
  email             text,
  city              text,
  building_address  text,
  message           text,
  source            text not null default 'landing'
                      check (source in ('landing','phone','referral','other')),
  status            text not null default 'new'
                      check (status in ('new','contacted','qualified','converted','lost')),
  assigned_to       uuid references sc_profiles(id) on delete set null,
  notes             text,
  utm_source        text,
  utm_campaign      text,
  ip                text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  contacted_at      timestamptz,
  converted_at      timestamptz
);

create index if not exists sc_leads_status_created_idx
  on sc_leads (status, created_at desc);
create index if not exists sc_leads_assigned_idx
  on sc_leads (assigned_to, status);

create or replace function sc_leads_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  if not exists (
    select 1 from pg_trigger where tgname = 'sc_leads_set_updated_at_trg'
  ) then
    create trigger sc_leads_set_updated_at_trg
      before update on sc_leads
      for each row execute function sc_leads_set_updated_at();
  end if;
end $$;

alter table sc_leads enable row level security;
