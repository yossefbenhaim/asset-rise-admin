// Asset Rise emits a few notification kinds into the shared sc_notifications
// table. We keep this union narrow on purpose — we don't need to type-check
// against the full Silver Castle set here.
//   'system.announcement' — god-mode Wave 3 broadcast fan-out (super-admin
//   blasts a system announcement to all users / one building / one role).
export type NotificationKind = 'lead.received' | 'submission.escalated' | 'system.announcement'
