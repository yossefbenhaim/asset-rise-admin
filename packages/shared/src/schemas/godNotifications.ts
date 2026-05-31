import { z } from 'zod'

// ── God-mode: System Broadcast (Wave 3 — content + comms) ────────────────────
// Zod inputs + response shapes for the super-admin broadcast domain — the
// marquee Wave-3 feature. Backend gating is requireLevel('admin.super') (direct
// roleKey membership); these schemas only validate payloads. Isolated from the
// other god schema files on purpose — the integration step re-exports this from
// packages/shared/src/index.ts.
//
// Domain model (silver-castle sc_*, confirmed against
// db/migrations/013_notifications.sql + 051_notifications_fix.sql +
// 052_notifications_event_index.sql):
//   sc_notifications(id, recipient_id → sc_profiles, kind text [NO db CHECK
//     since migration 051 — the TS NotificationKind union is the source of
//     truth], title, body, link, payload jsonb, read_at, created_at,
//     event_id uuid)
//     — A broadcast inserts ONE row per recipient. All rows of one send share
//       a single event_id (the unique index on (event_id, recipient_id) makes
//       the send idempotent — a re-run with the same event_id can't
//       double-notify). The NEW kind is 'system.announcement'.
//   Audience is resolved super-admin side:
//     all      — every sc_profiles row
//     building — every tenant of one building (sc_tenant_profiles.building_id),
//                expanded with active linked family members (sc_family_links)
//     role     — every sc_profiles.role = 'tenant' | 'provider'
//
// IMPORTANT: a broadcast can reach EVERY user in the system. It is the highest
// blast-radius write in god-mode, so the UI gates it behind a DangerConfirm
// whose token is the recipient COUNT the operator just previewed.

export const SYSTEM_ANNOUNCEMENT_KIND = 'system.announcement' as const

// The three audience shapes. A discriminated union so the building/role
// payloads can't be sent without their selector.
export const GodBroadcastAudience = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('building'), building_id: z.string().uuid() }),
  z.object({ type: z.literal('role'), role: z.enum(['tenant', 'provider']) }),
])
export type GodBroadcastAudience = z.infer<typeof GodBroadcastAudience>

// ── Recipient preview (read) ──────────────────────────────────────────────────
// Resolve an audience to a COUNT (and a small sample) WITHOUT sending, so the
// UI can show the blast radius and require typing that count before sending.
export const GodBroadcastPreviewInput = z.object({
  audience: GodBroadcastAudience,
})
export type GodBroadcastPreviewInput = z.infer<typeof GodBroadcastPreviewInput>

export interface GodBroadcastRecipientSample {
  id: string
  name: string | null
  email: string | null
}

export interface GodBroadcastPreview {
  count: number
  // A short label describing the resolved audience (e.g. "כל המשתמשים",
  // "דיירי הבניין · רחוב הרצל 5, חיפה", "כל הדיירים").
  audience_label: string
  // Up to ~20 example recipients so the operator can sanity-check the target.
  sample: GodBroadcastRecipientSample[]
}

// ── Buildings picker (read) ────────────────────────────────────────────────────
// A lightweight list of buildings (id + address) for the "one building"
// audience selector. Self-contained so the page doesn't depend on
// god.buildings being wired.
export interface GodBroadcastBuilding {
  id: string
  address: string | null
  city: string | null
  tenant_count: number
}

// ── Send (write — DangerConfirm) ────────────────────────────────────────────────
// Insert a 'system.announcement' notification row per resolved recipient. The
// `confirm` field carries the typed token from the DangerConfirm interlock
// (the previewed recipient count); the backend treats it only as a non-empty
// guard. `expected_count` is the count the operator saw at preview time — the
// backend re-resolves the audience and, if the live count drifts wildly, still
// sends to the fresh list but records both numbers in the audit meta.
export const GodBroadcastSendInput = z.object({
  audience: GodBroadcastAudience,
  title: z.string().trim().min(2, 'נדרשת כותרת').max(160),
  body: z.string().trim().max(2000).optional(),
  // Optional deep link the bell-feed row navigates to in the main app.
  link: z.string().trim().max(500).optional(),
  // The recipient count the operator previewed (for audit / drift detection).
  expected_count: z.number().int().min(0),
  // Non-empty interlock token from the DangerConfirm (the typed count).
  confirm: z.string().min(1).max(64),
})
export type GodBroadcastSendInput = z.infer<typeof GodBroadcastSendInput>

export interface GodBroadcastSendResult {
  event_id: string
  // How many notification rows were actually inserted.
  sent: number
  // The count the operator expected at preview time (drift visibility).
  expected: number
  audience_label: string
}

// ── Recent sends (read) ────────────────────────────────────────────────────────
// List recent 'system.announcement' broadcasts, grouped by event_id (one row
// per logical send), newest first — so the operator can review and resend.
export const GodBroadcastRecentInput = z.object({
  limit: z.number().int().min(1).max(200).default(50),
})
export type GodBroadcastRecentInput = z.infer<typeof GodBroadcastRecentInput>

export interface GodBroadcastRecent {
  event_id: string | null
  title: string
  body: string | null
  link: string | null
  // Total recipient rows for this send.
  recipient_count: number
  // How many recipients have read it.
  read_count: number
  // The earliest created_at across the send's rows.
  sent_at: string | null
}

// ── Resend (write — DangerConfirm) ──────────────────────────────────────────────
// Resend a prior broadcast: re-resolve the SAME audience it was originally sent
// to and insert a fresh batch with a NEW event_id (so it doesn't collide with
// the original send's unique (event_id, recipient_id) rows). Because the
// original audience selector isn't stored on the notification rows, resend
// takes the title/body/link of the prior send plus a fresh audience the
// operator re-confirms — keeping it explicit and high-friction.
export const GodBroadcastResendInput = z.object({
  // The event_id of the prior send (for audit linkage); the actual recipients
  // come from re-resolving `audience` below.
  source_event_id: z.string().uuid().nullable(),
  audience: GodBroadcastAudience,
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().max(2000).optional(),
  link: z.string().trim().max(500).optional(),
  expected_count: z.number().int().min(0),
  confirm: z.string().min(1).max(64),
})
export type GodBroadcastResendInput = z.infer<typeof GodBroadcastResendInput>
