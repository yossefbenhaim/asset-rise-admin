-- 033 — Yossef review stage: when a task clears the agent chain it gets a live
-- staging preview URL; Yossef inspects it and approves from the board, which
-- triggers the factory to merge the branch to main and deploy. Idempotent.

alter table sc_dev_tasks add column if not exists preview_url text;
