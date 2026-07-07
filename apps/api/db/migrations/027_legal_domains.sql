-- 027 — Legal Compliance domains: per-domain context for the "לשכה משפטית" tab.
-- One row per legal domain: why it binds Asset Rise (short summary + full
-- applicability analysis) and which parts of the business it touches (tags).
-- Snapshot pushed by the host collector from ~/legal/מפת-ציות.json. Idempotent.

create table if not exists sc_legal_domains (
  name       text primary key,               -- Hebrew domain name, matches sc_legal_requirements.domain
  icon       text,                            -- lucide icon name for the UI
  summary    text,                            -- Hebrew: why this domain matters to the business, in short
  applies    text,                            -- Hebrew: the full legal applicability analysis
  tags       jsonb not null default '[]'::jsonb, -- ["אתר","לקוחות","כסף",...]
  sort_order integer not null default 0,
  synced_at  timestamptz not null default now()
);

alter table sc_legal_domains enable row level security;
