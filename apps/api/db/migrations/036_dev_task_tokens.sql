-- 036 — per-round token accounting on dev tasks. The factory worker appends
-- {round, agent, stage, tokens, cost} to token_rounds after each agent run and
-- keeps total_tokens, so Yossef's review column shows what each stage cost.
alter table sc_dev_tasks
  add column if not exists token_rounds jsonb not null default '[]'::jsonb,
  add column if not exists total_tokens bigint not null default 0;
