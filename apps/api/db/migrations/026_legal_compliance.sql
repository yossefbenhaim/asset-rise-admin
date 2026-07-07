-- 026 — Legal Compliance Map: the lawyer-agent (Matt Murdock) requirements registry.
-- Snapshot table written by the HOST collector ~/.openclaw/scripts/agents-center-sync.py
-- from the machine-readable map Murdock maintains (~/legal/מפת-ציות.json).
-- Every row = one legal requirement backed by a specific Israeli law + section,
-- with the concrete document it demands and that document's lifecycle status.
-- Idempotent. NOTE: never `create extension` in a migration (aborts the run).

create table if not exists sc_legal_requirements (
  id          text primary key,              -- stable slug from the map (priv-01, ...)
  domain      text not null,                 -- Hebrew domain name (פרטיות ואבטחת מידע, ...)
  title       text not null,                 -- Hebrew: the requirement in one line
  why         text,                          -- Hebrew: why it binds Asset Rise specifically
  law         text not null,                 -- Hebrew full statute/regulation name + year
  section     text,                          -- exact section(s); empty = section-level cite pending
  source_url  text,                          -- primary source (gov.il / Knesset DB / נבו)
  severity    text not null default 'must',  -- must|should|recommended
  status      text not null default 'missing', -- missing|draft|lawyer_review|approved|not_applicable|blocked
  doc_path    text,                          -- the fulfilling document under ~/legal (if any)
  notes       text,
  sort_order  integer not null default 0,
  synced_at   timestamptz not null default now()
);
create index if not exists sc_legal_requirements_domain_idx on sc_legal_requirements(domain, sort_order);

alter table sc_legal_requirements enable row level security;

-- Visible to whoever can see the Agents Center (the legal tab lives beside it).
-- No new permission action needed: gated by admin.agents.view in the router.
