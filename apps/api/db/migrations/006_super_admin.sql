-- 006 — Super-admin tier (god-mode Wave 0 foundations).
-- Adds an is_super_admin flag to sc_admin_profiles, seeds it for the single
-- admin account, and seeds the 'admin.super' role_key permissions.
--
-- CONVENTION: all god capabilities use the 'god.*' action namespace under
-- role_key 'admin.super'. roleKey 'admin.super' is additive (pushed on top of
-- 'admin' only when is_super_admin is true). Backend gating is requireLevel/
-- requireAction in TS; the sc_can() SQL function (migration 001) is left
-- untouched on purpose — it serves silver-castle RLS and adding admin.super
-- there would only widen cross-app surface with no Wave-0 benefit.
--
-- Idempotent: add-column-if-not-exists + guarded UPDATE + on-conflict-do-nothing.

-- (a) Column ----------------------------------------------------------------
alter table sc_admin_profiles
  add column if not exists is_super_admin boolean not null default false;

create index if not exists sc_admin_profiles_super_idx
  on sc_admin_profiles (is_super_admin)
  where is_super_admin;

-- (b) Seed the flag for the only admin, resolved by email (no hardcoded UUID,
--     keeps the migration portable). Naturally idempotent (true -> true).
update sc_admin_profiles
   set is_super_admin = true
 where id in (select id from sc_profiles where email = 'admin@byclick.co.il');

-- (c) Seed god permissions (scope 'all' matches the sc_permissions scope CHECK).
insert into sc_permissions (role_key, action, scope) values
  ('admin.super', 'god.search',     'all'),
  ('admin.super', 'god.audit.list', 'all')
on conflict (role_key, action) do nothing;
