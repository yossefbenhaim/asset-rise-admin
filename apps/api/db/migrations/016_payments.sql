-- 016 — Payments ledger (admin-owned). Stripe/PayPal-ready; mock-seeded until a
-- real processor is wired. Service-role only (admin API). Idempotent.
create table if not exists sc_payments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references sc_profiles(id) on delete set null,
  lead_email  text,
  report_token text,
  amount      numeric(10,2) not null default 0,
  currency    text not null default 'ILS',
  status      text not null default 'pending' check (status in ('paid','pending','failed','refunded')),
  provider    text,                    -- 'stripe' | 'paypal' | 'manual' | 'mock'
  txn_id      text,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz,
  refunded_at timestamptz
);
create index if not exists sc_payments_status_idx on sc_payments(status, created_at desc);
create index if not exists sc_payments_email_idx  on sc_payments(lower(lead_email));
alter table sc_payments enable row level security;
drop policy if exists sc_payments_service_only on sc_payments;
create policy sc_payments_service_only on sc_payments for all using (false) with check (false);

-- Mock rows (demo until a real processor lands). Fixed ids → idempotent.
insert into sc_payments (id, lead_email, report_token, amount, currency, status, provider, txn_id, created_at, paid_at) values
  ('00000000-0000-0000-0000-000000010001','dani@example.com', null, 149, 'ILS', 'paid',     'mock','MOCK-1001', now() - interval '2 days',  now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000010002','rina@example.com', null, 149, 'ILS', 'paid',     'mock','MOCK-1002', now() - interval '5 days',  now() - interval '5 days'),
  ('00000000-0000-0000-0000-000000010003','moshe@example.com',null, 149, 'ILS', 'failed',   'mock','MOCK-1003', now() - interval '1 day',   null),
  ('00000000-0000-0000-0000-000000010004','yael@example.com', null, 299, 'ILS', 'paid',     'mock','MOCK-1004', now() - interval '9 days',  now() - interval '9 days'),
  ('00000000-0000-0000-0000-000000010005','avi@example.com',  null, 149, 'ILS', 'refunded', 'mock','MOCK-1005', now() - interval '14 days', now() - interval '14 days')
on conflict (id) do nothing;
