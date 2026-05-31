-- 011 — God-mode Wave 1: "Providers" capabilities.
-- Seeds the god.providers.* actions for role_key 'admin.super'. These actions
-- exist ONLY for the frontend nav/can() visibility mirror — the backend gate is
-- requireLevel('admin.super') (direct roleKey membership) regardless. Following
-- the migration 006 convention: all god capabilities live under 'admin.super'
-- with scope 'all'.
--
-- Wave 1 perms span three idempotent migrations:
--   009_god_tenants.sql   — god.tenants.*
--   010_god_buildings.sql — god.buildings.*
--   011 (this file)        — god.providers.*
--
-- Idempotent: on-conflict-do-nothing on (role_key, action).

insert into sc_permissions (role_key, action, scope) values
  ('admin.super', 'god.providers.update',     'all'),
  ('admin.super', 'god.providers.set_banned', 'all')
on conflict (role_key, action) do nothing;
