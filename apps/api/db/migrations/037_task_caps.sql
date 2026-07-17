-- 037 — runaway-task guard state. cap_raises counts how many times the per-task
-- rounds/token cap was raised (each trip auto-raises; Yossef's approve/reject
-- governs whether the task resumes). Effective cap = base * (cap_raises + 1).
alter table sc_dev_tasks add column if not exists cap_raises int not null default 0;
