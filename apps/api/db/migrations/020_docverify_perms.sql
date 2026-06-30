-- 020 — Wong (document-verification agent) monitor permission. Idempotent.
insert into sc_permissions (role_key, action, scope) values
  ('admin',         'admin.docverify.view', 'all'),
  ('admin.support', 'admin.docverify.view', 'all')
on conflict (role_key, action) do nothing;
