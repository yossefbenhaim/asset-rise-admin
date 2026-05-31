-- 013 — God-mode Wave 3 (FINAL wave): content + communication capabilities.
-- Consolidated seed of every Wave-3 god.* action for role_key 'admin.super',
-- covering the four new domains: documents + chat (content), notifications/
-- broadcast (communication), and the cross-domain "misc" moderation surface.
--
-- These actions exist ONLY for the frontend nav/can() visibility mirror — the
-- backend gate is requireLevel('admin.super') (direct roleKey membership)
-- regardless, so a stray sc_permissions row could never grant a plain 'admin'
-- access. Following the migration 006 convention: all god capabilities live
-- under 'admin.super' with scope 'all'.
--
-- All Wave-3 writes DELIBERATELY bypass the normal silver-castle flows; every
-- such write is audited via godMutation (attempt + outcome). Destructive /
-- high-blast-radius ops are guarded by a DangerConfirm in the UI.
--
--   Documents (content) — backing table sc_tenant_documents (no tombstone col):
--     god.documents.set_visibility — write the existing visibility column
--                                    ('private'|'building'|'provider'); a non-
--                                    private value requires building_id (CHECK).
--     god.documents.remove         — SOFT-hide a doc (visibility='private',
--                                    building_id=null, project_id=null,
--                                    is_confidential=true); preserves the row +
--                                    storage object. Destructive; DangerConfirm.
--   Chat (content) — sc_chat_messages, soft-delete via deleted_at:
--     god.chat.delete_message      — set deleted_at (hides for all tenants).
--                                    Destructive; DangerConfirm.
--     god.chat.restore_message     — deleted_at=null (reversible; no confirm).
--   Notifications / Broadcast (communication) — sc_notifications fan-out:
--     god.broadcast.send           — insert a 'system.announcement' row per
--                                    recipient for a chosen audience (ALL users,
--                                    all tenants of one building, or one role).
--                                    HIGHEST blast radius; DangerConfirm on count.
--     god.broadcast.resend         — re-broadcast a prior send to a re-confirmed
--                                    audience with a fresh event_id; same gating.
--   Misc — cross-domain moderation:
--     god.misc.remove_family_member — SOFT-remove a sc_family_links row
--                                     (set removed_at). Destructive; DangerConfirm.
--     god.misc.cancel_inspection    — DELETE a sc_inspections row (no 'cancelled'
--                                     status exists; files cascade). Destructive.
--     god.misc.set_rating_verified  — flip sc_provider_ratings.verified
--                                     (reversible; no DangerConfirm).
--     god.misc.remove_rating        — DELETE a sc_provider_ratings row (an AFTER
--                                     trigger recomputes the cached aggregate).
--                                     Destructive; DangerConfirm.
--
-- A broadcast writes 'system.announcement' rows into sc_notifications. That kind
-- requires NO db migration on the table — migration 051 dropped the kind CHECK
-- and made the TypeScript NotificationKind union the single source of truth. This
-- migration therefore only seeds permissions + the broadcast review index.
--
-- Idempotent: on-conflict-do-nothing on (role_key, action) + index-if-not-exists
-- — safe to re-run on every container boot.

insert into sc_permissions (role_key, action, scope) values
  -- Documents (content)
  ('admin.super', 'god.documents.set_visibility',  'all'),
  ('admin.super', 'god.documents.remove',          'all'),
  -- Chat (content)
  ('admin.super', 'god.chat.delete_message',       'all'),
  ('admin.super', 'god.chat.restore_message',      'all'),
  -- Notifications / Broadcast (communication)
  ('admin.super', 'god.broadcast.send',            'all'),
  ('admin.super', 'god.broadcast.resend',          'all'),
  -- Misc — cross-domain moderation
  ('admin.super', 'god.misc.remove_family_member', 'all'),
  ('admin.super', 'god.misc.cancel_inspection',    'all'),
  ('admin.super', 'god.misc.set_rating_verified',  'all'),
  ('admin.super', 'god.misc.remove_rating',        'all')
on conflict (role_key, action) do nothing;

-- Supporting index for the broadcast "recent sends" review (router lists
-- 'system.announcement' rows newest-first, then aggregates by event_id in
-- memory). No such index existed before (the main app only queries per-recipient),
-- so a kind + recency index keeps the review query off a full table scan.
create index if not exists sc_notifications_kind_created_idx
  on sc_notifications (kind, created_at desc);
