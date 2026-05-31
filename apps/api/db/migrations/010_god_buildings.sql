-- 010 — God-mode Wave 1: "Buildings + Projects" capabilities.
-- Seeds the god.buildings.* actions for role_key 'admin.super'. These actions
-- exist ONLY for the frontend nav/can() visibility mirror — the backend gate is
-- requireLevel('admin.super') (direct roleKey membership) regardless. Following
-- the migration 006 convention: all god capabilities live under 'admin.super'
-- with scope 'all'.
--
-- Idempotent: on-conflict-do-nothing on (role_key, action).

insert into sc_permissions (role_key, action, scope) values
  ('admin.super', 'god.buildings.list',          'all'),
  ('admin.super', 'god.buildings.update',        'all'),
  ('admin.super', 'god.buildings.force_stage',   'all'),
  ('admin.super', 'god.buildings.reassign_role', 'all'),
  ('admin.super', 'god.buildings.delete',        'all')
on conflict (role_key, action) do nothing;
