-- 034 — richer dev-task tickets: deeper context fields the agents actually use.
-- Additive + idempotent. `depends_on int[]` already exists (031); these give a
-- ticket its system area, target user, acceptance criteria, regression guard,
-- size and reference links so Jarvis/Vision build the right thing the first time.
alter table sc_dev_tasks
  add column if not exists system_area text,
  add column if not exists user_persona text,
  add column if not exists acceptance_criteria text,
  add column if not exists do_not_break text,
  add column if not exists size text,
  add column if not exists reference_links text;
