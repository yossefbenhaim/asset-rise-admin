-- 028 — Legal requirement resolution routing: who can close each requirement
-- (dev = Claude Code task, murdock = legal draft, fury = finance, shield =
-- security, yossef = human-only), a short Hebrew explanation of the chain, and
-- a ready-to-paste task prompt in the right format for that resolver.
-- Synced from ~/legal/מפת-ציות.json by the host collector. Idempotent.

alter table sc_legal_requirements add column if not exists resolver     text;
alter table sc_legal_requirements add column if not exists resolver_how text;
alter table sc_legal_requirements add column if not exists task_prompt  text;
