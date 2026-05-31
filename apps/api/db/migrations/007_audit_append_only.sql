-- 007 — Make sc_audit_log append-only at the DB layer.
--
-- WHY A TRIGGER (not RLS): every ctx.db in both apps is the Supabase
-- service-role client, which BYPASSES RLS. Triggers are NOT bypassable by the
-- service role, so a BEFORE UPDATE/DELETE trigger that RAISEs is the only
-- airtight way to guarantee the audit trail is immutable. INSERT is untouched,
-- so audit() / logGod() keep working.
--
-- TRUNCATE is not a row-level event, so the row trigger above does not cover
-- it — we add a statement-level BEFORE TRUNCATE trigger as well for true
-- immutability.
--
-- Idempotent: create-or-replace function + drop-trigger-if-exists then create.

create or replace function sc_audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'sc_audit_log is append-only (% blocked)', tg_op
    using errcode = '23514';
end;
$$;

-- Row-level: blocks UPDATE and DELETE on every row.
drop trigger if exists sc_audit_log_no_mutate on sc_audit_log;
create trigger sc_audit_log_no_mutate
  before update or delete on sc_audit_log
  for each row execute function sc_audit_log_immutable();

-- Statement-level: closes the TRUNCATE hole (row triggers never fire on it).
drop trigger if exists sc_audit_log_no_truncate on sc_audit_log;
create trigger sc_audit_log_no_truncate
  before truncate on sc_audit_log
  for each statement execute function sc_audit_log_immutable();
