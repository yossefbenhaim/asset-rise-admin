import { z } from 'zod'

// ── God-mode: Tenders + Bids (Wave 2 — "Deals") ──────────────────────────────
// Zod inputs + response shapes for the super-admin tenders domain. Backend
// gating is requireLevel('admin.super') (see lib/god.ts); these schemas only
// validate payloads. Isolated from the other god schema files on purpose — the
// integration step re-exports this from packages/shared/src/index.ts.
//
// Data model (silver-castle sc_*):
//   sc_tenders(id, building_id, created_by, title, description, scope,
//     budget_min, budget_max, deadline_at, status, awarded_provider_id, …)
//   sc_tender_bids(id, tender_id, provider_id, amount, eta_weeks, scope_summary,
//     attachments_urls, status, …)
//   sc_project_providers(id, project_id, provider_id, role_in_project, …) — the
//     "linked" record forceAward inserts (UNIQUE(project_id, provider_id)).

// Canonical tender lifecycle. MUST stay in lockstep with the
// sc_tenders_status_check CHECK constraint in silver-castle.
export const TENDER_STATUSES = [
  'draft',
  'open',
  'closed',
  'awarded',
  'cancelled',
] as const
export type TenderStatus = (typeof TENDER_STATUSES)[number]

export const TENDER_STATUS_LABEL: Record<TenderStatus, string> = {
  draft: 'טיוטה',
  open: 'פתוח',
  closed: 'סגור',
  awarded: 'זכה',
  cancelled: 'בוטל',
}

export const TenderStatusEnum = z.enum(TENDER_STATUSES)

// Bid lifecycle (sc_tender_bids.status).
export const TENDER_BID_STATUSES = [
  'submitted',
  'withdrawn',
  'rejected',
  'accepted',
] as const
export type TenderBidStatus = (typeof TENDER_BID_STATUSES)[number]

export const TENDER_BID_STATUS_LABEL: Record<TenderBidStatus, string> = {
  submitted: 'הוגשה',
  withdrawn: 'בוטלה',
  rejected: 'נדחתה',
  accepted: 'התקבלה',
}

// ── Inputs ───────────────────────────────────────────────────────────────────
export const GodTenderListInput = z.object({
  // Optional free-text over the tender title. Empty lists recents (capped).
  q: z.string().max(160).optional(),
  status: TenderStatusEnum.optional(),
  limit: z.number().int().min(1).max(500).default(200),
})
export type GodTenderListInput = z.infer<typeof GodTenderListInput>

export const GodTenderGetInput = z.object({ id: z.string().uuid() })
export type GodTenderGetInput = z.infer<typeof GodTenderGetInput>

// setTenderStatus — move a tender along its lifecycle. "reopen" = closed→open is
// just the open target; the repo refuses no-op transitions and (defensively) any
// move out of a terminal 'awarded' state with a Hebrew error.
export const GodSetTenderStatusInput = z.object({
  id: z.string().uuid(),
  status: TenderStatusEnum,
})
export type GodSetTenderStatusInput = z.infer<typeof GodSetTenderStatusInput>

// forceAward — the dangerous, result-overriding op. Sets awarded_provider_id +
// the chosen bid status='accepted' (others 'rejected') + inserts the
// sc_project_providers "linked" record. DangerConfirm types the tender title;
// the backend re-verifies it against the live row before mutating.
export const GodForceAwardInput = z.object({
  id: z.string().uuid(),
  bid_id: z.string().uuid(),
  confirm: z.string().min(1).max(400),
})
export type GodForceAwardInput = z.infer<typeof GodForceAwardInput>

// cancelTender — force-cancel. DangerConfirm types the tender title; the backend
// re-verifies it against the live row before cancelling.
export const GodCancelTenderInput = z.object({
  id: z.string().uuid(),
  confirm: z.string().min(1).max(400),
})
export type GodCancelTenderInput = z.infer<typeof GodCancelTenderInput>

// ── Response shapes ──────────────────────────────────────────────────────────
export interface GodTenderListItem {
  id: string
  building_id: string | null
  building_address: string | null
  title: string | null
  status: TenderStatus | string | null
  budget_min: number | null
  budget_max: number | null
  deadline_at: string | null
  awarded_provider_id: string | null
  bid_count: number
  created_at: string | null
}

export interface GodTenderBid {
  id: string
  provider_id: string | null
  provider_name: string | null
  provider_email: string | null
  provider_type: string | null
  amount: number | null
  eta_weeks: number | null
  scope_summary: string | null
  status: TenderBidStatus | string | null
  is_awarded: boolean
  created_at: string | null
}

export interface GodTenderDetail {
  id: string
  building_id: string | null
  building_address: string | null
  project_id: string | null
  created_by: string | null
  title: string | null
  description: string | null
  scope: string | null
  budget_min: number | null
  budget_max: number | null
  deadline_at: string | null
  status: TenderStatus | string | null
  awarded_provider_id: string | null
  awarded_provider_name: string | null
  created_at: string | null
  updated_at: string | null
  bids: GodTenderBid[]
}
