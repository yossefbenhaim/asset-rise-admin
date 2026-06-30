-- 015 — Seed Control Center permissions (reports / processing / payments /
-- sources / ai / logs). Mirrors web src/lib/auth/permissions.ts. scope='all'
-- (admin queries are cross-building). Idempotent.

insert into sc_permissions (role_key, action, scope) values
  -- ─── admin (analyst / system manager — full operational control) ───
  ('admin', 'admin.reports.list',    'all'),
  ('admin', 'admin.reports.update',  'all'),
  ('admin', 'admin.reports.rerun',   'all'),
  ('admin', 'admin.processing.view', 'all'),
  ('admin', 'admin.payments.list',   'all'),
  ('admin', 'admin.sources.view',    'all'),
  ('admin', 'admin.ai.view',         'all'),
  ('admin', 'admin.ai.regenerate',   'all'),
  ('admin', 'admin.logs.list',       'all'),

  -- ─── admin.super — prompt editing (sensitive); rest inherited via 'admin' ───
  ('admin.super', 'admin.ai.edit_prompt', 'all'),

  -- ─── admin.support (read-mostly ops) ───
  ('admin.support', 'admin.reports.list',    'all'),
  ('admin.support', 'admin.processing.view', 'all'),
  ('admin.support', 'admin.sources.view',    'all'),
  ('admin.support', 'admin.logs.list',       'all'),

  -- ─── admin.sales (revenue + report read) ───
  ('admin.sales', 'admin.reports.list',  'all'),
  ('admin.sales', 'admin.payments.list', 'all')
on conflict (role_key, action) do nothing;
