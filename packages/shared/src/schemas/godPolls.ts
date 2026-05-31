import { z } from 'zod'

// ── God-mode: Polls / Elections (Wave 2 — "Workflow") ────────────────────────
// Zod inputs + response shapes for the super-admin polls domain. Backend gating
// is requireLevel('admin.super') (see lib/god.ts); these schemas only validate
// payloads. Isolated from the other god schema files on purpose — the
// integration step re-exports this from packages/shared/src/index.ts.
//
// Data model (silver-castle sc_*, verified against the live DB):
//   sc_polls(id, building_id [NOT NULL, FK→sc_buildings CASCADE], kind [CHECK],
//     question [NOT NULL], threshold_pct [NOT NULL default 51, 1..100],
//     deadline_at [nullable since migration 060], status [CHECK default 'open'],
//     result_user_id [nullable FK→sc_profiles SET NULL], description,
//     created_by [nullable FK→sc_profiles SET NULL], target_kind, target_id)
//   sc_poll_options(id, poll_id [FK CASCADE], user_id [nullable FK→sc_profiles],
//     label [NOT NULL]) — UNIQUE(poll_id, user_id)
//   sc_poll_votes(poll_id, voter_id, option_id, created_at, acted_by_user_id) —
//     PK(poll_id, voter_id); the tally groups votes by option_id.
//
// IMPORTANT — god overrides bypass the normal flow. In silver-castle a poll is
// finalized by the chair/finalize logic which closes it and sets result_user_id
// off the tally + threshold. A god write sets status / result_user_id DIRECTLY
// via service-role with NO tally check and NO threshold check. Every such write
// is audited via godMutation; the result-overriding ones are gated behind a
// DangerConfirm (type the poll question).

// ── Poll kinds ───────────────────────────────────────────────────────────────
// MUST stay in lockstep with sc_polls_kind_check.
export const POLL_KINDS = [
  'representative_election',
  'announcement',
  'decision',
  'provider_selection',
] as const
export type PollKind = (typeof POLL_KINDS)[number]

export const POLL_KIND_LABEL: Record<PollKind, string> = {
  representative_election: 'בחירת נציג',
  announcement: 'הודעה',
  decision: 'החלטה',
  provider_selection: 'בחירת ספק',
}

export const PollKindEnum = z.enum(POLL_KINDS)

// ── Poll statuses ────────────────────────────────────────────────────────────
// MUST stay in lockstep with sc_polls_status_check.
export const POLL_STATUSES = ['open', 'closed', 'finalized', 'expired'] as const
export type PollStatus = (typeof POLL_STATUSES)[number]

export const POLL_STATUS_LABEL: Record<PollStatus, string> = {
  open: 'פתוח',
  closed: 'סגור',
  finalized: 'הוכרע',
  expired: 'פג תוקף',
}

export const PollStatusEnum = z.enum(POLL_STATUSES)

// Building picker option for the createPoll form (self-contained to this domain).
export interface GodPollBuildingOption {
  id: string
  label: string
}

// ── List / filter ─────────────────────────────────────────────────────────────
// Optional free-text over the question + optional kind/status/building filters.
// An empty query lists the most-recent polls (capped by limit).
export const GodPollListInput = z.object({
  q: z.string().max(200).optional(),
  kind: PollKindEnum.optional(),
  status: PollStatusEnum.optional(),
  building_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).default(200),
})
export type GodPollListInput = z.infer<typeof GodPollListInput>

export interface GodPollListItem {
  id: string
  building_id: string | null
  building_address: string | null
  kind: PollKind | string | null
  question: string | null
  threshold_pct: number | null
  deadline_at: string | null
  status: PollStatus | string | null
  result_user_id: string | null
  result_user_name: string | null
  option_count: number
  vote_count: number
  created_at: string | null
}

// ── Detail ────────────────────────────────────────────────────────────────────
export const GodPollGetInput = z.object({ id: z.string().uuid() })
export type GodPollGetInput = z.infer<typeof GodPollGetInput>

// One option + its live vote count (the read-only tally). user_id is set for
// representative-election / provider-selection options (the candidate); label is
// the displayed text.
export interface GodPollOption {
  id: string
  user_id: string | null
  user_name: string | null
  label: string | null
  vote_count: number
  // Share of the total votes cast on this poll (0..100, rounded), for the bar.
  vote_pct: number
}

export interface GodPollDetail {
  id: string
  building_id: string | null
  building_address: string | null
  kind: PollKind | string | null
  question: string | null
  description: string | null
  threshold_pct: number | null
  deadline_at: string | null
  status: PollStatus | string | null
  result_user_id: string | null
  result_user_name: string | null
  created_by: string | null
  created_at: string | null
  total_votes: number
  options: GodPollOption[]
}

// ── Writes ────────────────────────────────────────────────────────────────────
// createPoll — author a new poll on a building. The options are simple labelled
// choices (optionally tied to a candidate user_id for an election). Status is
// always created as 'open'. threshold_pct defaults to the DB default (51) when
// omitted. deadline_at is nullable.
export const GodCreatePollOption = z.object({
  label: z.string().trim().min(1).max(200),
  user_id: z.string().uuid().nullable().optional(),
})
export type GodCreatePollOption = z.infer<typeof GodCreatePollOption>

export const GodCreatePollInput = z.object({
  building_id: z.string().uuid(),
  kind: PollKindEnum,
  question: z.string().trim().min(1).max(500),
  description: z.string().trim().max(2000).nullable().optional(),
  threshold_pct: z.number().int().min(1).max(100).optional(),
  // ISO datetime string; nullable (deadline-less polls are allowed).
  deadline_at: z.string().datetime().nullable().optional(),
  options: z.array(GodCreatePollOption).max(50).optional(),
})
export type GodCreatePollInput = z.infer<typeof GodCreatePollInput>

// forceFinalize — set status='finalized'. Does NOT compute a winner from the
// tally and does NOT touch result_user_id (use overrideResult for that). The
// repo refuses a no-op (already finalized).
export const GodForceFinalizePollInput = z.object({ id: z.string().uuid() })
export type GodForceFinalizePollInput = z.infer<typeof GodForceFinalizePollInput>

// reopen — set status='open'. The repo refuses a no-op (already open).
export const GodReopenPollInput = z.object({ id: z.string().uuid() })
export type GodReopenPollInput = z.infer<typeof GodReopenPollInput>

// overrideResult — VERY dangerous. Sets result_user_id and/or status DIRECTLY,
// bypassing the tally + threshold entirely. DangerConfirm types the poll
// question; the backend re-verifies it against the live row before mutating.
// result_user_id may be null (clear the result). At least one of result_user_id
// (present) or status must be supplied — enforced by the repo.
export const GodOverrideResultInput = z.object({
  id: z.string().uuid(),
  // Use the `set_result` flag to distinguish "don't touch" from "set to null".
  set_result: z.boolean().default(false),
  result_user_id: z.string().uuid().nullable().optional(),
  status: PollStatusEnum.optional(),
  confirm: z.string().min(1).max(500),
})
export type GodOverrideResultInput = z.infer<typeof GodOverrideResultInput>
