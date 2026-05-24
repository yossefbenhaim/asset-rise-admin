// Asset Rise emits two new notification kinds into the shared sc_notifications
// table. We keep this union narrow on purpose — we don't need to type-check
// against the full Silver Castle set here.
export type NotificationKind = 'lead.received' | 'submission.escalated'
