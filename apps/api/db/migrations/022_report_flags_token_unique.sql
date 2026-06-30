-- 022 — Report flags are a TEAM-WIDE pin per report (one row per report_token),
-- not per-admin: every read in reports.ts looks them up by report_token alone
-- (maybeSingle / pinnedSet), and setFlag upserts with onConflict(report_token).
-- The original table had unique(report_token, admin_id), so that upsert had no
-- matching constraint and FAILED — pinning silently errored and never stuck.
-- Align the constraint to report_token. Idempotent.

-- Dedupe any existing rows down to the most recently updated per token
-- (tie-break: keep the lowest id) so the new unique can be created.
delete from sc_report_flags a
using sc_report_flags b
where a.report_token = b.report_token
  and a.updated_at < b.updated_at;

delete from sc_report_flags a
using sc_report_flags b
where a.report_token = b.report_token
  and a.updated_at = b.updated_at
  and a.id > b.id;

alter table sc_report_flags drop constraint if exists sc_report_flags_report_token_admin_id_key;
create unique index if not exists sc_report_flags_report_token_uidx on sc_report_flags(report_token);
