import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GodPollListInput,
  GodPollListItem,
  GodPollDetail,
  GodPollOption,
  GodCreatePollInput,
  GodPollBuildingOption,
  PollKind,
  PollStatus,
} from '@asset-rise/shared/schemas/godPolls'

// God-mode "Polls / Elections" repo (Wave 2 — Workflow). Runs as service-role
// (adminClient bypasses RLS) so it reads/writes any sc_* row. Routers gate
// access; repos only do DB work. All writes are wrapped by godMutation() at the
// router layer so the attempt + outcome are both audited around the write.
//
// IMPORTANT: forceFinalize / overrideResult / reopen BYPASS the normal poll
// flow that lives in the silver-castle repos (chair/finalize logic computes the
// winner from the tally + threshold). They set status / result_user_id DIRECTLY
// via service-role with NO tally check and NO threshold check. This is a
// deliberate god-mode override (documented on the router + surfaced behind a
// DangerConfirm for overrideResult). createPoll inserts the poll then its
// options in sequence (best-effort atomic; godMutation audits any partial).

// Postgres SQLSTATEs we translate to Hebrew at the router layer.
export const PG_FK_VIOLATION = '23503'
export const PG_CHECK_VIOLATION = '23514'

// Sentinel a write throws when a precondition fails; the router maps it to a
// Hebrew BAD_REQUEST.
export class PollPreconditionError extends Error {}

function addressOf(b: {
  street?: string | null
  building_number?: string | null
  city?: string | null
} | null | undefined): string | null {
  if (!b) return null
  const line = [b.street, b.building_number].filter(Boolean).join(' ')
  const full = [line, b.city].filter(Boolean).join(', ').trim()
  return full || null
}

// Batch-resolve building addresses for a set of building ids.
async function addressesFor(
  db: SupabaseClient,
  buildingIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (!buildingIds.length) return out
  const { data } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .in('id', Array.from(new Set(buildingIds)))
  for (const b of (data ?? []) as any[]) out.set(b.id, addressOf(b))
  return out
}

// Batch-resolve profile names for a set of ids.
async function namesFor(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { full_name: string | null; email: string | null }>> {
  const out = new Map<string, { full_name: string | null; email: string | null }>()
  const clean = Array.from(new Set(ids.filter(Boolean)))
  if (!clean.length) return out
  const { data } = await db
    .from('sc_profiles')
    .select('id, full_name, email')
    .in('id', clean)
  for (const p of (data ?? []) as any[]) {
    out.set(p.id, { full_name: p.full_name ?? null, email: p.email ?? null })
  }
  return out
}

// ── Building picker for createPoll ─────────────────────────────────────────────
export async function listBuildingOptions(
  db: SupabaseClient,
): Promise<GodPollBuildingOption[]> {
  const { data, error } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .order('city', { ascending: true })
    .limit(1000)
  if (error) throw new Error(error.message)
  return ((data ?? []) as any[]).map(b => ({
    id: b.id,
    label: addressOf(b) || b.id,
  }))
}

// ── List ─────────────────────────────────────────────────────────────────────
// All polls + building address + option/vote counts + resolved result winner.
// Optional kind/status/building filters and a free-text question search.
export async function listPolls(
  db: SupabaseClient,
  input: GodPollListInput,
): Promise<GodPollListItem[]> {
  let q = db
    .from('sc_polls')
    .select(
      'id, building_id, kind, question, threshold_pct, deadline_at, status, result_user_id, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200)

  if (input.kind) q = q.eq('kind', input.kind)
  if (input.status) q = q.eq('status', input.status)
  if (input.building_id) q = q.eq('building_id', input.building_id)

  const safe = input.q ? input.q.replace(/[(),%_*\\]/g, ' ').trim() : ''
  if (safe) q = q.ilike('question', `%${safe}%`)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]
  if (!rows.length) return []

  const pollIds = rows.map(r => r.id)

  // Option counts (one batched query over all poll ids).
  const optionCount = new Map<string, number>()
  {
    const { data: opts } = await db
      .from('sc_poll_options')
      .select('poll_id')
      .in('poll_id', pollIds)
    for (const o of (opts ?? []) as any[]) {
      const k = o.poll_id as string
      if (k) optionCount.set(k, (optionCount.get(k) ?? 0) + 1)
    }
  }

  // Vote counts (one batched query over all poll ids).
  const voteCount = new Map<string, number>()
  {
    const { data: votes } = await db
      .from('sc_poll_votes')
      .select('poll_id')
      .in('poll_id', pollIds)
    for (const v of (votes ?? []) as any[]) {
      const k = v.poll_id as string
      if (k) voteCount.set(k, (voteCount.get(k) ?? 0) + 1)
    }
  }

  const addrById = await addressesFor(
    db,
    rows.map(r => r.building_id).filter(Boolean),
  )
  const nameById = await namesFor(
    db,
    rows.map(r => r.result_user_id).filter(Boolean),
  )

  return rows.map(r => ({
    id: r.id,
    building_id: r.building_id ?? null,
    building_address: r.building_id ? addrById.get(r.building_id) ?? null : null,
    kind: (r.kind ?? null) as PollKind | null,
    question: r.question ?? null,
    threshold_pct: r.threshold_pct ?? null,
    deadline_at: r.deadline_at ?? null,
    status: (r.status ?? null) as PollStatus | null,
    result_user_id: r.result_user_id ?? null,
    result_user_name: r.result_user_id
      ? nameById.get(r.result_user_id)?.full_name ?? null
      : null,
    option_count: optionCount.get(r.id) ?? 0,
    vote_count: voteCount.get(r.id) ?? 0,
    created_at: r.created_at ?? null,
  }))
}

// ── Detail ───────────────────────────────────────────────────────────────────
// One poll + all its options with the live per-option vote tally (read-only).
export async function getPollDetail(
  db: SupabaseClient,
  id: string,
): Promise<GodPollDetail | null> {
  const { data: p, error } = await db
    .from('sc_polls')
    .select(
      'id, building_id, kind, question, description, threshold_pct, deadline_at, status, result_user_id, created_by, created_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!p) return null

  const buildingAddress = p.building_id
    ? (await addressesFor(db, [p.building_id])).get(p.building_id) ?? null
    : null

  // Options.
  const { data: optRows } = await db
    .from('sc_poll_options')
    .select('id, user_id, label')
    .eq('poll_id', id)
  const rawOpts = (optRows ?? []) as any[]

  // Votes — tally by option_id.
  const { data: voteRows } = await db
    .from('sc_poll_votes')
    .select('option_id')
    .eq('poll_id', id)
  const tally = new Map<string, number>()
  for (const v of (voteRows ?? []) as any[]) {
    const k = v.option_id as string
    if (k) tally.set(k, (tally.get(k) ?? 0) + 1)
  }
  const totalVotes = (voteRows ?? []).length

  // Resolve option candidate names + the winner name in one batched lookup.
  const nameById = await namesFor(db, [
    ...rawOpts.map(o => o.user_id).filter(Boolean),
    ...(p.result_user_id ? [p.result_user_id] : []),
  ])

  const options: GodPollOption[] = rawOpts
    .map(o => {
      const count = tally.get(o.id) ?? 0
      return {
        id: o.id,
        user_id: o.user_id ?? null,
        user_name: o.user_id ? nameById.get(o.user_id)?.full_name ?? null : null,
        label: o.label ?? null,
        vote_count: count,
        vote_pct: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
      }
    })
    // Highest vote count first, then by label for stable ordering.
    .sort((a, b) => b.vote_count - a.vote_count || (a.label ?? '').localeCompare(b.label ?? '', 'he'))

  return {
    id: p.id,
    building_id: p.building_id ?? null,
    building_address: buildingAddress,
    kind: (p.kind ?? null) as PollKind | null,
    question: p.question ?? null,
    description: p.description ?? null,
    threshold_pct: p.threshold_pct ?? null,
    deadline_at: p.deadline_at ?? null,
    status: (p.status ?? null) as PollStatus | null,
    result_user_id: p.result_user_id ?? null,
    result_user_name: p.result_user_id
      ? nameById.get(p.result_user_id)?.full_name ?? null
      : null,
    created_by: p.created_by ?? null,
    created_at: p.created_at ?? null,
    total_votes: totalVotes,
    options,
  }
}

// Re-read the live poll question + status — used by overrideResult to verify the
// typed confirmation string against reality before mutating.
export async function getPollConfirmRow(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; question: string | null; status: string | null } | null> {
  const { data, error } = await db
    .from('sc_polls')
    .select('id, question, status')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { id: data.id, question: data.question ?? null, status: data.status ?? null }
}

// ── Writes ───────────────────────────────────────────────────────────────────
// createPoll — author a new poll (always status='open') + insert its options.
// The building_id FK is enforced by the DB (23503 → Hebrew at the router). The
// kind CHECK is validated by Zod; threshold_pct omitted → DB default (51).
// created_by is stamped with the acting super-admin's id for attribution.
export async function createPoll(
  db: SupabaseClient,
  input: GodCreatePollInput,
  createdBy: string | null,
): Promise<{ id: string; option_count: number }> {
  const pollRow: Record<string, unknown> = {
    building_id: input.building_id,
    kind: input.kind,
    question: input.question,
    status: 'open',
    created_by: createdBy,
  }
  if (input.description !== undefined) pollRow.description = input.description
  if (input.threshold_pct !== undefined) pollRow.threshold_pct = input.threshold_pct
  if (input.deadline_at !== undefined) pollRow.deadline_at = input.deadline_at

  const { data: poll, error } = await db
    .from('sc_polls')
    .insert(pollRow)
    .select('id')
    .maybeSingle()
  if (error) throw error
  if (!poll) throw new Error('NOT_FOUND')
  const pollId = poll.id as string

  let optionCount = 0
  const opts = input.options ?? []
  if (opts.length) {
    const rows = opts.map(o => ({
      poll_id: pollId,
      label: o.label,
      user_id: o.user_id ?? null,
    }))
    const { error: optErr } = await db.from('sc_poll_options').insert(rows)
    if (optErr) throw optErr
    optionCount = rows.length
  }

  return { id: pollId, option_count: optionCount }
}

// forceFinalize — set status='finalized'. Pure status flip; does NOT compute a
// winner from the tally and does NOT touch result_user_id. Refuses a no-op.
export async function forceFinalizePoll(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; status: string }> {
  const live = await getPollConfirmRow(db, id)
  if (!live) throw new Error('NOT_FOUND')
  if (live.status === 'finalized') {
    throw new PollPreconditionError('ההצבעה כבר הוכרעה')
  }
  const { data, error } = await db
    .from('sc_polls')
    .update({ status: 'finalized' })
    .eq('id', id)
    .select('id, status')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return { id: data.id, status: data.status }
}

// reopen — set status='open'. Refuses a no-op (already open).
export async function reopenPoll(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; status: string }> {
  const live = await getPollConfirmRow(db, id)
  if (!live) throw new Error('NOT_FOUND')
  if (live.status === 'open') {
    throw new PollPreconditionError('ההצבעה כבר פתוחה')
  }
  const { data, error } = await db
    .from('sc_polls')
    .update({ status: 'open' })
    .eq('id', id)
    .select('id, status')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return { id: data.id, status: data.status }
}

// overrideResult — VERY dangerous. Sets result_user_id and/or status DIRECTLY,
// bypassing the tally + threshold. `setResult` distinguishes "leave alone" from
// "set to null". At least one of (setResult, status) must be supplied. When a
// result_user_id is given it must be a valid sc_profiles id (FK enforced; 23503
// → Hebrew at the router).
export async function overrideResult(
  db: SupabaseClient,
  args: {
    id: string
    setResult: boolean
    resultUserId: string | null
    status: PollStatus | undefined
  },
): Promise<{ id: string; status: string; result_user_id: string | null }> {
  const live = await getPollConfirmRow(db, args.id)
  if (!live) throw new Error('NOT_FOUND')

  const patch: Record<string, unknown> = {}
  if (args.setResult) patch.result_user_id = args.resultUserId
  if (args.status !== undefined) patch.status = args.status
  if (Object.keys(patch).length === 0) {
    throw new PollPreconditionError('לא נבחר דבר לעדכון — יש לקבוע תוצאה או סטטוס')
  }

  const { data, error } = await db
    .from('sc_polls')
    .update(patch)
    .eq('id', args.id)
    .select('id, status, result_user_id')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return {
    id: data.id,
    status: data.status,
    result_user_id: data.result_user_id ?? null,
  }
}
