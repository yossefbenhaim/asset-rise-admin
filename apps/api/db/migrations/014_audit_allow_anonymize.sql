-- 014_audit_allow_anonymize.sql
--
-- FIX: the Wave-0 immutable-audit trigger (migrations 007/008) blocked EVERY
-- UPDATE on sc_audit_log. But sc_audit_log.actor_id is a FK to sc_profiles(id)
-- with ON DELETE SET NULL, so silver-castle's deleteMyAccount (which deletes the
-- user's sc_profiles row) triggered a cascade UPDATE on sc_audit_log to null the
-- actor_id — which the trigger rejected with "sc_audit_log is append-only
-- (UPDATE blocked)". Net effect: NO user could delete their account.
--
-- This relaxes the trigger to permit EXACTLY that anonymization and nothing
-- else: an UPDATE where actor_id goes non-null -> null and every other column is
-- byte-for-byte unchanged. The audit CONTENT (action / target / meta / ip /
-- created_at / project_id / id) stays fully immutable; DELETE and TRUNCATE stay
-- blocked. Only WHO performed an action can be anonymized, and only as the FK
-- SET NULL side effect of that actor deleting their own account.
--
-- Idempotent: CREATE OR REPLACE FUNCTION. The two triggers (sc_audit_log_no_mutate
-- BEFORE UPDATE/DELETE FOR EACH ROW, sc_audit_log_no_truncate BEFORE TRUNCATE FOR
-- EACH STATEMENT, both ENABLE ALWAYS) already reference this function by name, so
-- replacing the function body is all that is needed.

create or replace function public.sc_audit_log_immutable()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and old.actor_id is not null and new.actor_id is null
     and new.id          is not distinct from old.id
     and new.action      is not distinct from old.action
     and new.target_type is not distinct from old.target_type
     and new.target_id   is not distinct from old.target_id
     and new.meta        is not distinct from old.meta
     and new.ip          is not distinct from old.ip
     and new.created_at  is not distinct from old.created_at
     and new.project_id  is not distinct from old.project_id
  then
    return new;  -- permit the FK ON DELETE SET NULL anonymization
  end if;
  raise exception 'sc_audit_log is append-only (% blocked)', tg_op using errcode = '23514';
end;
$$;
