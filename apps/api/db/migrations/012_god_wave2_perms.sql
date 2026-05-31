-- 012 — God-mode Wave 2: workflow + deals capabilities.
-- Seeds every Wave-2 god.* action for role_key 'admin.super', covering the four
-- new domains: negotiations + tenders (deals) and polls + workflow (workflow).
--
-- These actions exist ONLY for the frontend nav/can() visibility mirror — the
-- backend gate is requireLevel('admin.super') (direct roleKey membership)
-- regardless, so a stray sc_permissions row could never grant a plain 'admin'
-- access. Following the migration 006 convention: all god capabilities live
-- under 'admin.super' with scope 'all'.
--
-- All Wave-2 writes DELIBERATELY bypass the normal silver-castle flows
-- (openMutualPoll → tenant vote → finalize for negotiations; the bid/poll flow
-- for tender awards; the chair/finalize tally for polls; the dependency gates +
-- two-party dual-sign for workflow). Every such write is audited via godMutation.
--
--   Negotiations (deals):
--     god.negotiations.force_stage     — set stage to any of the 9
--     god.negotiations.force_status    — set status to any of the 6
--     god.negotiations.link_provider   — INSERT sc_project_providers directly
--     god.negotiations.unlink_provider — DELETE sc_project_providers (destructive)
--   Tenders (deals):
--     god.tenders.set_status           — force a tender lifecycle status
--     god.tenders.force_award          — award a bid + link the provider (destructive)
--     god.tenders.cancel               — force-cancel a tender (destructive)
--   Polls / elections (workflow):
--     god.polls.create                 — author a new poll (+ options)
--     god.polls.force_finalize         — set status='finalized' (no winner computed)
--     god.polls.reopen                 — set status='open'
--     god.polls.override_result        — set result_user_id / status directly (destructive)
--   Workflow / baton / dual-approval:
--     god.workflow.set_task_status     — force a project/building task status
--     god.workflow.reassign_task       — set owner_user_id / assigned_to
--     god.workflow.set_baton           — set active_coordinator/lawyer/developer_id
--     god.workflow.resolve_dual_approval — force a stuck approval approved/rejected
--
-- Idempotent: on-conflict-do-nothing on (role_key, action) — safe to re-run.

insert into sc_permissions (role_key, action, scope) values
  ('admin.super', 'god.negotiations.force_stage',       'all'),
  ('admin.super', 'god.negotiations.force_status',      'all'),
  ('admin.super', 'god.negotiations.link_provider',     'all'),
  ('admin.super', 'god.negotiations.unlink_provider',   'all'),
  ('admin.super', 'god.tenders.set_status',             'all'),
  ('admin.super', 'god.tenders.force_award',            'all'),
  ('admin.super', 'god.tenders.cancel',                 'all'),
  ('admin.super', 'god.polls.create',                   'all'),
  ('admin.super', 'god.polls.force_finalize',           'all'),
  ('admin.super', 'god.polls.reopen',                   'all'),
  ('admin.super', 'god.polls.override_result',          'all'),
  ('admin.super', 'god.workflow.set_task_status',       'all'),
  ('admin.super', 'god.workflow.reassign_task',         'all'),
  ('admin.super', 'god.workflow.set_baton',             'all'),
  ('admin.super', 'god.workflow.resolve_dual_approval', 'all')
on conflict (role_key, action) do nothing;
