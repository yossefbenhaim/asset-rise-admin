-- History for the weekly test ecosystem, so "did it pass" is a question with an
-- answer rather than a scroll through Telegram.
--
-- Written by ~/ar-ci-record.sh after each tier finishes, and read by the admin
-- Test Runs page. One row per (run, tier): the tiers have very different costs
-- and failure modes, and collapsing them into one row per week would hide which
-- half of the ecosystem is actually red.
--
-- Idempotent like every migration here — migrate.ts re-executes every file on
-- every api boot.

create table if not exists sc_test_runs (
  id           uuid primary key default gen_random_uuid(),
  run_id       text        not null,
  tier         text        not null,
  -- The ui-proof-run.sh exit contract, preserved verbatim:
  --   0 pass · 1 a spec failed · 2 infrastructure (NOT a product failure) · 3 skipped
  rc           smallint    not null,
  verdict      text        not null,
  specs_passed integer     not null default 0,
  specs_failed integer     not null default 0,
  duration_s   integer     not null default 0,
  branch       text,
  sha          text,
  report_url   text,
  -- Tier-specific detail: the authz matrix totals, chat timings, resource samples.
  details      jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists sc_test_runs_created_idx on sc_test_runs (created_at desc);
create index if not exists sc_test_runs_tier_idx    on sc_test_runs (tier, created_at desc);
-- One row per tier per run: re-recording a tier must update, not duplicate.
create unique index if not exists sc_test_runs_run_tier_idx on sc_test_runs (run_id, tier);

alter table sc_test_runs enable row level security;
-- Service role only. The admin API reads it with the service key; no anon or
-- authenticated role has any business here.
drop policy if exists sc_test_runs_no_public on sc_test_runs;
create policy sc_test_runs_no_public on sc_test_runs for all using (false);
