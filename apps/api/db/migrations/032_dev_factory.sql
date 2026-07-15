-- 032 — Dev Factory: the dev-tasks board becomes a Jira-style pipeline run by
-- the REAL agent team (Jarvis spec → Vision dev → Hawkeye QA → Shield security).
-- Adds: per-task rich context (the agent's brief), a work branch, an appended
-- work log, and a question thread — an agent that lacks information posts a
-- question and pauses; Yossef answers in the admin; the factory worker resumes
-- the task with the answer in context. Idempotent.

alter table sc_dev_tasks add column if not exists context text;   -- detailed brief the acting agent receives
alter table sc_dev_tasks add column if not exists branch text;    -- git branch the work happens on
alter table sc_dev_tasks add column if not exists work_log text;  -- appended per-stage agent reports

create table if not exists sc_dev_task_questions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references sc_dev_tasks(id) on delete cascade,
  asked_by    text not null,                    -- agent name (vision/hawkeye/shield/...)
  question    text not null,
  answer      text,
  status      text not null default 'open',     -- open|answered
  asked_at    timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists sc_dev_task_questions_task_idx on sc_dev_task_questions(task_id);
create index if not exists sc_dev_task_questions_status_idx on sc_dev_task_questions(status);

alter table sc_dev_task_questions enable row level security;
-- Answering/reading is covered by the existing admin.devtasks.* actions.
