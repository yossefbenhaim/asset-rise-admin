-- 008 — Harden the append-only audit log (defense-in-depth over migration 007).
--
-- Two gaps the 007 security review surfaced:
--  1. Triggers were created in default ENABLE mode (tgenabled='O'), which a
--     SUPERUSER can bypass with `set session_replication_role = 'replica'`.
--     ENABLE ALWAYS (tgenabled='A') makes them fire even under replica role,
--     so the immutability holds against everyone except someone who can ALTER
--     the table itself.
--  2. sc_audit_log still carried default table grants to anon/authenticated.
--     The app writes audit only via the service-role (which bypasses grants),
--     so anon/authenticated need NO privileges here — revoke them.
--
-- Idempotent: guarded by trigger/role existence; ENABLE ALWAYS + REVOKE are
-- no-ops on re-run.

do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'sc_audit_log_no_mutate' and tgrelid = 'sc_audit_log'::regclass) then
    execute 'alter table sc_audit_log enable always trigger sc_audit_log_no_mutate';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'sc_audit_log_no_truncate' and tgrelid = 'sc_audit_log'::regclass) then
    execute 'alter table sc_audit_log enable always trigger sc_audit_log_no_truncate';
  end if;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke insert, update, delete, truncate, references, trigger on sc_audit_log from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke insert, update, delete, truncate, references, trigger on sc_audit_log from authenticated';
  end if;
end $$;
