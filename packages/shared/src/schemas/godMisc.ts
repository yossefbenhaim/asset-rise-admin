import { z } from 'zod'

// ── God-mode: Cross-domain Admin / "Misc" (Wave 3 — content + comms) ──────────
// Zod inputs + response shapes for the super-admin cross-domain moderation page.
// Backend gating is requireLevel('admin.super') (direct roleKey membership);
// these schemas only validate payloads. Isolated from the other god schema files
// on purpose — the integration step re-exports this from
// packages/shared/src/index.ts.
//
// This domain is READ-FIRST: cross-building read views for the remaining domains
// (family, inspections, ratings, calendar/meetings) plus a few clearly-safe
// moderation writes. Everything was ground-truthed against the silver-castle
// migrations before being modelled here.
//
// Domain models (silver-castle sc_*, confirmed against db/migrations):
//   FAMILY — 047_family_members.sql + 048_family_inherit_building.sql
//     sc_family_invitations(id, primary_user_id → sc_profiles, invitee_email,
//       invitee_name, invitation_token, status[pending|accepted|expired|
//       cancelled], created_at, accepted_at, cancelled_at, expires_at,
//       accepted_by_user_id → sc_profiles)
//     sc_family_links(id, primary_user_id → sc_profiles, member_user_id →
//       sc_profiles, member_display_name, invitation_id → sc_family_invitations,
//       created_at, removed_at)
//       — REMOVAL IS SOFT: set removed_at = now(). A partial unique index
//         (member_user_id WHERE removed_at IS NULL) means "active" = removed_at
//         null, so soft-remove is the canonical removal (NOT a hard delete).
//
//   INSPECTIONS — 017_inspections.sql
//     sc_inspections(id, project_id → sc_projects, provider_id → sc_profiles,
//       inspection_type, slot[1..3], title, summary, score, status[draft|
//       submitted|revised], submitted_at, created_at, updated_at)
//       — there is NO 'cancelled' status in the CHECK constraint, so a god
//         "cancel" can NOT set status='cancelled' (it would violate the CHECK).
//         cancelInspection therefore DELETEs the row (sc_inspection_files cascade
//         off it). It is destructive → DangerConfirm + audited.
//
//   RATINGS — 018_provider_ratings.sql (+ 062 self-report delete)
//     sc_provider_ratings(id, provider_id → sc_profiles, source[in_app|yad2|
//       google_maps|facebook|linkedin|custom], rating numeric(3,2), review_count,
//       review_text, external_url, verified bool, submitted_by → sc_profiles
//       [null = provider self-report], project_id → sc_projects, created_at)
//       — there is NO `hidden`/`visibility`/`is_hidden` column. The only
//         moderation levers are `verified` (boolean) and DELETE. So:
//           * setRatingVerified — non-destructive flag toggle (hide-equivalent
//             "demote"): mark a rating verified/unverified.
//           * removeRating — DELETE the row (destructive → DangerConfirm). An
//             AFTER trigger recomputes sc_provider_profiles.public_rating_summary.
//       — there is NO sc_rating_reports / rating-report table anywhere in the
//         migrations, so resolveRatingReport is intentionally NOT modelled here
//         (SKIPPED — schema cannot be confirmed). Noted to integration.
//
//   CALENDAR / MEETINGS — 027_calendar_events.sql + 055_negotiation_stages_meetings.sql
//     sc_calendar_events(id, building_id, project_id, created_by → auth.users,
//       kind[meeting|vote_deadline|milestone|provider_appointment|
//       tender_deadline|custom], title, description, starts_at, ends_at,
//       location, source_table, source_id, participants jsonb, created_at)
//     sc_negotiation_meetings(id, negotiation_id → sc_provider_negotiations,
//       scheduled_at, location, link, held_at, summary, created_at)
//       — READ-ONLY here (lean): cross-building visibility, no writes.

// ── shared "search + limit" base ──────────────────────────────────────────────
const ListBase = z.object({
  q: z.string().max(160).optional(),
  limit: z.number().int().min(1).max(500).default(200),
})

// ── FAMILY — invitations ──────────────────────────────────────────────────────
export const FAMILY_INVITATION_STATUSES = [
  'pending',
  'accepted',
  'expired',
  'cancelled',
] as const
export type FamilyInvitationStatus = (typeof FAMILY_INVITATION_STATUSES)[number]

export const FAMILY_INVITATION_STATUS_LABEL: Record<FamilyInvitationStatus, string> = {
  pending: 'ממתינה',
  accepted: 'התקבלה',
  expired: 'פגה',
  cancelled: 'בוטלה',
}

export const GodFamilyInvitationListInput = ListBase.extend({
  status: z.enum(FAMILY_INVITATION_STATUSES).optional(),
})
export type GodFamilyInvitationListInput = z.infer<typeof GodFamilyInvitationListInput>

export interface GodFamilyInvitationItem {
  id: string
  primary_user_id: string | null
  primary_name: string | null
  primary_email: string | null
  invitee_email: string | null
  invitee_name: string | null
  status: FamilyInvitationStatus | string | null
  created_at: string | null
  accepted_at: string | null
  cancelled_at: string | null
  expires_at: string | null
  accepted_by_user_id: string | null
  accepted_by_name: string | null
}

// ── FAMILY — active links (members) ─────────────────────────────────────────────
export const GodFamilyLinkListInput = ListBase.extend({
  // Include soft-removed links too (removed_at set). Default false = active only.
  include_removed: z.boolean().default(false),
})
export type GodFamilyLinkListInput = z.infer<typeof GodFamilyLinkListInput>

export interface GodFamilyLinkItem {
  id: string
  primary_user_id: string | null
  primary_name: string | null
  primary_email: string | null
  member_user_id: string | null
  member_name: string | null
  member_email: string | null
  member_display_name: string | null
  created_at: string | null
  removed_at: string | null
}

// removeFamilyMember — SOFT-remove a family link (set removed_at = now()).
// Destructive (severs the member's inherited access) → DangerConfirm. `confirm`
// carries the typed member name/email token; the backend treats it only as a
// non-empty guard. Idempotent: re-removing an already-removed link is a no-op.
export const GodRemoveFamilyMemberInput = z.object({
  id: z.string().uuid(),
  confirm: z.string().min(1).max(400),
})
export type GodRemoveFamilyMemberInput = z.infer<typeof GodRemoveFamilyMemberInput>

// ── INSPECTIONS ────────────────────────────────────────────────────────────────
export const INSPECTION_STATUSES = ['draft', 'submitted', 'revised'] as const
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number]

export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  draft: 'טיוטה',
  submitted: 'הוגש',
  revised: 'תוקן',
}

export const INSPECTION_TYPE_LABEL: Record<string, string> = {
  architectural_feasibility: 'היתכנות אדריכלית',
  planning_check: 'בדיקה תכנונית',
  cluster_feasibility: 'היתכנות מתחם',
  constraints_check: 'בדיקת מגבלות',
  economic_feasibility: 'היתכנות כלכלית',
  property_valuation: 'הערכת שווי',
  rental_assessment: 'הערכת שכירות',
  commercial_appraisal: 'שומה מסחרית',
}

export const GodInspectionListInput = ListBase.extend({
  status: z.enum(INSPECTION_STATUSES).optional(),
  project_id: z.string().uuid().optional(),
})
export type GodInspectionListInput = z.infer<typeof GodInspectionListInput>

export interface GodInspectionItem {
  id: string
  project_id: string | null
  project_name: string | null
  building_address: string | null
  provider_id: string | null
  provider_name: string | null
  inspection_type: string | null
  slot: number | null
  title: string | null
  score: number | null
  status: InspectionStatus | string | null
  submitted_at: string | null
  created_at: string | null
}

// cancelInspection — DELETE the inspection row (sc_inspection_files cascade off
// it). There is no 'cancelled' status in the CHECK constraint, so this removes
// the report entirely. Destructive → DangerConfirm + audited.
export const GodCancelInspectionInput = z.object({
  id: z.string().uuid(),
  confirm: z.string().min(1).max(400),
})
export type GodCancelInspectionInput = z.infer<typeof GodCancelInspectionInput>

// ── RATINGS ──────────────────────────────────────────────────────────────────
export const RATING_SOURCES = [
  'in_app',
  'yad2',
  'google_maps',
  'facebook',
  'linkedin',
  'custom',
] as const
export type RatingSource = (typeof RATING_SOURCES)[number]

export const RATING_SOURCE_LABEL: Record<RatingSource, string> = {
  in_app: 'בתוך המערכת',
  yad2: 'יד2',
  google_maps: 'Google Maps',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  custom: 'מקור מותאם',
}

export const GodRatingListInput = ListBase.extend({
  source: z.enum(RATING_SOURCES).optional(),
  provider_id: z.string().uuid().optional(),
  verified: z.boolean().optional(),
})
export type GodRatingListInput = z.infer<typeof GodRatingListInput>

export interface GodRatingItem {
  id: string
  provider_id: string | null
  provider_name: string | null
  source: RatingSource | string | null
  rating: number | null
  review_count: number | null
  review_text: string | null
  external_url: string | null
  verified: boolean
  submitted_by: string | null
  submitter_name: string | null
  project_id: string | null
  created_at: string | null
}

// setRatingVerified — flip the `verified` flag. Non-destructive moderation
// ("hide-equivalent" demote/promote): a malicious rating can be marked
// unverified so the public profile down-weights it; a legit one can be verified.
// No DangerConfirm — it is reversible.
export const GodSetRatingVerifiedInput = z.object({
  id: z.string().uuid(),
  verified: z.boolean(),
})
export type GodSetRatingVerifiedInput = z.infer<typeof GodSetRatingVerifiedInput>

// removeRating — DELETE the rating row (destructive → DangerConfirm). The
// AFTER-trigger recomputes sc_provider_profiles.public_rating_summary. `confirm`
// is a non-empty token guard (the provider/submitter label).
export const GodRemoveRatingInput = z.object({
  id: z.string().uuid(),
  confirm: z.string().min(1).max(400),
})
export type GodRemoveRatingInput = z.infer<typeof GodRemoveRatingInput>

// ── CALENDAR / MEETINGS (read-only) ─────────────────────────────────────────────
export const CALENDAR_KINDS = [
  'meeting',
  'vote_deadline',
  'milestone',
  'provider_appointment',
  'tender_deadline',
  'custom',
] as const
export type CalendarKind = (typeof CALENDAR_KINDS)[number]

export const CALENDAR_KIND_LABEL: Record<CalendarKind, string> = {
  meeting: 'פגישה',
  vote_deadline: 'מועד הצבעה',
  milestone: 'אבן דרך',
  provider_appointment: 'פגישת ספק',
  tender_deadline: 'מועד מכרז',
  custom: 'אחר',
}

export const GodCalendarListInput = ListBase.extend({
  kind: z.enum(CALENDAR_KINDS).optional(),
  building_id: z.string().uuid().optional(),
})
export type GodCalendarListInput = z.infer<typeof GodCalendarListInput>

export interface GodCalendarItem {
  id: string
  building_id: string | null
  building_address: string | null
  project_id: string | null
  project_name: string | null
  created_by: string | null
  creator_name: string | null
  kind: CalendarKind | string | null
  title: string | null
  starts_at: string | null
  ends_at: string | null
  location: string | null
  created_at: string | null
}

// ── Counts (header dashboard) ───────────────────────────────────────────────────
export interface GodMiscCounts {
  family_invitations: number
  family_links_active: number
  inspections: number
  ratings: number
  calendar_events: number
  meetings: number
}
