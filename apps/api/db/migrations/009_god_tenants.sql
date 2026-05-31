-- 009 — God-mode Wave 1: "Tenants + Vaad" capabilities.
-- Seeds the god.tenants.* actions for role_key 'admin.super'. These actions
-- exist ONLY for the frontend nav/can() visibility mirror — the backend gate is
-- requireLevel('admin.super') (direct roleKey membership) regardless. Following
-- the migration 006 convention: all god capabilities live under 'admin.super'
-- with scope 'all'.
--
-- Idempotent: on-conflict-do-nothing on (role_key, action).

insert into sc_permissions (role_key, action, scope) values
  ('admin.super', 'god.tenants.list',          'all'),
  ('admin.super', 'god.tenants.update',        'all'),
  ('admin.super', 'god.tenants.set_vaad',      'all'),
  ('admin.super', 'god.tenants.move_building', 'all'),
  ('admin.super', 'god.tenants.set_banned',    'all'),
  ('admin.super', 'god.tenants.delete',        'all')
on conflict (role_key, action) do nothing;
