-- 003 — Seed admin permissions in sc_permissions.
-- Three role keys: admin / admin.support / admin.sales.
-- All scope='all' since admin queries are cross-building.

insert into sc_permissions (role_key, action, scope) values
  -- ─── admin (top-level, all access) ──────────────────────────────
  ('admin', 'admin.dashboard',         'all'),
  ('admin', 'admin.users.list',        'all'),
  ('admin', 'admin.users.update',      'all'),
  ('admin', 'admin.users.disable',     'all'),
  ('admin', 'admin.users.delete',      'all'),
  ('admin', 'admin.leads.list',        'all'),
  ('admin', 'admin.leads.update',      'all'),
  ('admin', 'admin.buildings.list',    'all'),
  ('admin', 'admin.submissions.list',  'all'),

  -- ─── admin.support (helpdesk) ──────────────────────────────────
  ('admin.support', 'admin.dashboard',        'all'),
  ('admin.support', 'admin.users.list',       'all'),
  ('admin.support', 'admin.leads.list',       'all'),
  ('admin.support', 'admin.submissions.list', 'all'),

  -- ─── admin.sales (CRM-only) ────────────────────────────────────
  ('admin.sales', 'admin.dashboard',   'all'),
  ('admin.sales', 'admin.leads.list',  'all'),
  ('admin.sales', 'admin.leads.update','all')
on conflict (role_key, action) do nothing;
