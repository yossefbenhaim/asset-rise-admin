import { z } from 'zod'

// ── God-mode: Provider Negotiations (Wave 2 — "deals") ───────────────────────
// Zod inputs + response shapes for the super-admin negotiations domain. Backend
// gating is requireLevel('admin.super') (direct roleKey membership); these
// schemas only validate payloads. Isolated from the other god schema files on
// purpose — the integration step re-exports this from packages/shared/src/index.ts.
//
// Domain model (silver-castle sc_*):
//   sc_provider_negotiations(id, building_id, project_id, chair_id, provider_id,
//     provider_type, status, stage, poll_id, result_summary)
//   sc_negotiation_messages(negotiation_id, sender_id, body, meta)
//   sc_project_providers(id, project_id, provider_id, role_in_project,
//     invitation_id, added_at) = the "linked" row. The negotiation's
//     provider_type is written INTO the role_in_project column (the table has
//     NO provider_type column), matching silver-castle negotiation-finalize.ts
//     and god.tenders forceAward. UNIQUE(project_id, provider_id).
//
// IMPORTANT — god overrides bypass the normal flow. In silver-castle a
// negotiation is finalized through openMutualPoll → the tenant vote → the
// finalize logic (repos/negotiation-finalize.ts), which is what flips status to
// confirmed/rejected, sets stage='linked' and INSERTs sc_project_providers. A
// god write sets status/stage and inserts/deletes sc_project_providers DIRECTLY
// via service-role, with NO poll and NO tenant vote. Every such write is audited
// via godMutation and the dangerous ones are gated behind a DangerConfirm.

// ── Negotiation stages (the 9-step provider workflow) ────────────────────────
// MUST stay in lockstep with the silver-castle negotiation stage enum.
export const NEGOTIATION_STAGES = [
  'contact',
  'schedule_meeting',
  'meeting_held',
  'meeting_summary',
  'negotiation',
  'contract_upload',
  'vote',
  'approval',
  'linked',
] as const
export type NegotiationStage = (typeof NEGOTIATION_STAGES)[number]

export const NEGOTIATION_STAGE_LABEL: Record<NegotiationStage, string> = {
  contact: 'יצירת קשר',
  schedule_meeting: 'תיאום פגישה',
  meeting_held: 'פגישה התקיימה',
  meeting_summary: 'סיכום פגישה',
  negotiation: 'משא ומתן',
  contract_upload: 'העלאת חוזה',
  vote: 'הצבעת דיירים',
  approval: 'אישור',
  linked: 'שיוך הושלם',
}

export const NegotiationStageEnum = z.enum(NEGOTIATION_STAGES)

// ── Negotiation statuses (the 6 lifecycle states) ────────────────────────────
export const NEGOTIATION_STATUSES = [
  'open',
  'mutual_agreed',
  'tenant_voting',
  'confirmed',
  'rejected',
  'cancelled',
] as const
export type NegotiationStatus = (typeof NEGOTIATION_STATUSES)[number]

export const NEGOTIATION_STATUS_LABEL: Record<NegotiationStatus, string> = {
  open: 'פתוח',
  mutual_agreed: 'הסכמה הדדית',
  tenant_voting: 'בהצבעת דיירים',
  confirmed: 'אושר',
  rejected: 'נדחה',
  cancelled: 'בוטל',
}

export const NegotiationStatusEnum = z.enum(NEGOTIATION_STATUSES)

// Provider types — mirrors silver-castle ProviderType. Used to label the party
// and as the provider_type written into sc_project_providers on link.
export const NEGOTIATION_PROVIDER_TYPES = [
  'architect',
  'appraiser',
  'lawyer',
  'developer',
  'contractor',
  'coordinator',
  'generic',
] as const
export type NegotiationProviderType = (typeof NEGOTIATION_PROVIDER_TYPES)[number]

export const NEGOTIATION_PROVIDER_TYPE_LABEL: Record<NegotiationProviderType, string> = {
  architect: 'אדריכל',
  appraiser: 'שמאי',
  lawyer: 'עו״ד',
  developer: 'יזם',
  contractor: 'קבלן',
  coordinator: 'גורם מלווה',
  generic: 'ספק כללי',
}

// The provider_type column is free text in the DB; the picker offers the known
// types but the schema accepts any short non-empty string for forward-compat.
export const NegotiationProviderTypeInput = z.string().trim().min(1).max(40)

// ── List / filter ─────────────────────────────────────────────────────────────
export const GodNegotiationListInput = z.object({
  status: NegotiationStatusEnum.optional(),
  stage: NegotiationStageEnum.optional(),
  building_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  q: z.string().max(160).optional(),
  limit: z.number().int().min(1).max(500).default(200),
})
export type GodNegotiationListInput = z.infer<typeof GodNegotiationListInput>

export interface GodNegotiationListItem {
  id: string
  building_id: string | null
  project_id: string | null
  building_address: string | null
  project_name: string | null
  chair_id: string | null
  chair_name: string | null
  provider_id: string | null
  provider_name: string | null
  provider_type: string | null
  status: NegotiationStatus | string | null
  stage: NegotiationStage | string | null
  poll_id: string | null
  message_count: number
  result_summary: string | null
}

// ── Detail ────────────────────────────────────────────────────────────────────
export const GodNegotiationGetInput = z.object({ id: z.string().uuid() })
export type GodNegotiationGetInput = z.infer<typeof GodNegotiationGetInput>

export interface GodNegotiationMessage {
  id: string
  sender_id: string | null
  sender_name: string | null
  body: string | null
  meta: Record<string, unknown> | null
  created_at: string | null
}

export interface GodNegotiationDetail {
  id: string
  building_id: string | null
  project_id: string | null
  building_address: string | null
  project_name: string | null
  chair_id: string | null
  chair_name: string | null
  chair_email: string | null
  provider_id: string | null
  provider_name: string | null
  provider_email: string | null
  provider_type: string | null
  status: NegotiationStatus | string | null
  stage: NegotiationStage | string | null
  poll_id: string | null
  result_summary: string | null
  created_at: string | null
  // Whether a sc_project_providers row already links this provider+type to the
  // project (the "linked" record). Lets the UI show link/unlink state.
  is_linked: boolean
  messages: GodNegotiationMessage[]
}

// ── Writes ────────────────────────────────────────────────────────────────────
// forceStage — set the negotiation stage to any of the 9. Pure override; does
// NOT touch sc_project_providers (use linkProvider for that).
export const GodNegForceStageInput = z.object({
  id: z.string().uuid(),
  stage: NegotiationStageEnum,
})
export type GodNegForceStageInput = z.infer<typeof GodNegForceStageInput>

// forceStatus — set the negotiation status to any of the 6. Forcing
// confirmed/rejected/cancelled bypasses the tenant poll; the UI surfaces a
// Hebrew warning and (for the result-overriding values) a DangerConfirm.
export const GodNegForceStatusInput = z.object({
  id: z.string().uuid(),
  status: NegotiationStatusEnum,
})
export type GodNegForceStatusInput = z.infer<typeof GodNegForceStatusInput>

// linkProvider — UPSERT sc_project_providers(project_id, provider_id,
// role_in_project) directly, bypassing the openMutualPoll/finalize flow. The
// negotiation's provider_type is written INTO role_in_project (no provider_type
// column exists). Defaults the project + provider + type from the negotiation
// when omitted; idempotent on UNIQUE(project_id, provider_id).
export const GodNegLinkProviderInput = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  provider_id: z.string().uuid().optional(),
  provider_type: NegotiationProviderTypeInput.optional(),
})
export type GodNegLinkProviderInput = z.infer<typeof GodNegLinkProviderInput>

// unlinkProvider — DELETE the sc_project_providers row (destructive). `confirm`
// carries the typed provider name/label from the DangerConfirm interlock; the
// backend treats it only as a non-empty token guard (the row is identified by
// project_id + provider_id).
export const GodNegUnlinkProviderInput = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  provider_id: z.string().uuid().optional(),
  confirm: z.string().min(1).max(400),
})
export type GodNegUnlinkProviderInput = z.infer<typeof GodNegUnlinkProviderInput>
