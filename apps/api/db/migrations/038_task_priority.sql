-- 038 — business priority on dev tasks (0=P0 revenue-critical, 1=P1, 2=P2).
-- The factory pulls by priority first, then seq.
alter table sc_dev_tasks add column if not exists priority int not null default 2;
