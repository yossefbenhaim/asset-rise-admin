-- Content drafts — Parker's article/page drafts awaiting Yossef's review in the
-- admin (visual preview + approve/reject). payload = the full Article object as
-- authored; hero_image_b64 lets the admin preview render the generated hero
-- before anything is deployed.
create table if not exists sc_content_drafts (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'news' check (kind in ('news', 'city', 'guide')),
  slug text not null,
  title text not null,
  branch text,
  payload jsonb not null,
  hero_image_b64 text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'published')),
  submitted_by text not null default 'newsroom',
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

create index if not exists idx_content_drafts_status on sc_content_drafts (status, created_at desc);
create unique index if not exists idx_content_drafts_slug_pending
  on sc_content_drafts (kind, slug) where status = 'pending';

alter table sc_content_drafts enable row level security;
