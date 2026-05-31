import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GodTenderListInput,
  GodTenderListItem,
  GodTenderDetail,
  GodTenderBid,
  TenderStatus,
} from '@asset-rise/shared'

// God-mode "Tenders + Bids" repo (Wave 2 — Deals). Runs as service-role
// (adminClient bypasses RLS) so it reads/writes any sc_* row. Routers gate
// access; repos only do DB work. All writes are wrapped by godMutation() at the
// router layer so attempt + outcome are audited around the write.
//
// IMPORTANT: forceAward BYPASSES the normal tender/bid flow that lives in the
// silver-castle repos. It sets the award + bid statuses + inserts the
// sc_project_providers "linked" record DIRECTLY via service-role. This is a
// deliberate god-mode override (documented on the router + surfaced behind a
// DangerConfirm in the UI). It is best-effort atomic — the writes run in
// sequence; the worst-case partial state is recorded by godMutation's audit.

// Postgres SQLSTATEs we translate to Hebrew at the router layer.
export const PG_FK_VIOLATION = '23503'
export const PG_UNIQUE_VIOLATION = '23505'

// Sentinel a write throws when a precondition fails; the router maps it to a
// Hebrew BAD_REQUEST/PRECONDITION_FAILED.
export class TenderPreconditionError extends Error {}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

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

// ── List ─────────────────────────────────────────────────────────────────────
// All tenders + their building address + bid count. Optional status filter and
// free-text title search.
export async function listTenders(
  db: SupabaseClient,
  input: GodTenderListInput,
): Promise<GodTenderListItem[]> {
  let q = db
    .from('sc_tenders')
    .select(
      'id, building_id, title, status, budget_min, budget_max, deadline_at, awarded_provider_id, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200)

  if (input.status) q = q.eq('status', input.status)

  const safe = input.q ? input.q.replace(/[(),%_*\\]/g, ' ').trim() : ''
  if (safe) q = q.ilike('title', `%${safe}%`)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]
  if (!rows.length) return []

  // Bid counts (one batched query over all tender ids).
  const tenderIds = rows.map(r => r.id)
  const bidCount = new Map<string, number>()
  const { data: bids } = await db
    .from('sc_tender_bids')
    .select('tender_id')
    .in('tender_id', tenderIds)
  for (const b of (bids ?? []) as any[]) {
    const k = b.tender_id as string
    if (k) bidCount.set(k, (bidCount.get(k) ?? 0) + 1)
  }

  const addrById = await addressesFor(
    db,
    rows.map(r => r.building_id).filter(Boolean),
  )

  return rows.map(r => ({
    id: r.id,
    building_id: r.building_id ?? null,
    building_address: r.building_id ? addrById.get(r.building_id) ?? null : null,
    title: r.title ?? null,
    status: (r.status ?? null) as TenderStatus | null,
    budget_min: num(r.budget_min),
    budget_max: num(r.budget_max),
    deadline_at: r.deadline_at ?? null,
    awarded_provider_id: r.awarded_provider_id ?? null,
    bid_count: bidCount.get(r.id) ?? 0,
    created_at: r.created_at ?? null,
  }))
}

// ── Detail ───────────────────────────────────────────────────────────────────
// One tender + all its bids (sorted by amount asc, nulls last) with the bidding
// provider's name/email/type resolved. Also resolves the tender's building
// address, its project id (for forceAward's linked record), and the awarded
// provider's name.
export async function getTenderDetail(
  db: SupabaseClient,
  id: string,
): Promise<GodTenderDetail | null> {
  const { data: t, error } = await db
    .from('sc_tenders')
    .select(
      'id, building_id, created_by, title, description, scope, budget_min, budget_max, deadline_at, status, awarded_provider_id, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!t) return null

  const buildingAddress = t.building_id
    ? (await addressesFor(db, [t.building_id])).get(t.building_id) ?? null
    : null

  // Resolve the building's project id (for the forceAward linked record).
  let projectId: string | null = null
  if (t.building_id) {
    const { data: pj } = await db
      .from('sc_projects')
      .select('id')
      .eq('building_id', t.building_id)
      .order('created_at', { ascending: false })
      .limit(1)
    projectId = ((pj ?? [])[0] as any)?.id ?? null
  }

  const { data: bidRows } = await db
    .from('sc_tender_bids')
    .select('id, provider_id, amount, eta_weeks, scope_summary, status, created_at')
    .eq('tender_id', id)
  const rawBids = (bidRows ?? []) as any[]

  // Resolve bidding providers + the awarded provider in one batched lookup.
  const profileIds = new Set<string>()
  for (const b of rawBids) if (b.provider_id) profileIds.add(b.provider_id)
  if (t.awarded_provider_id) profileIds.add(t.awarded_provider_id)
  const profileById = new Map<string, any>()
  if (profileIds.size) {
    const { data: profs } = await db
      .from('sc_profiles')
      .select('id, full_name, email, provider_type')
      .in('id', Array.from(profileIds))
    for (const p of (profs ?? []) as any[]) profileById.set(p.id, p)
  }

  const bids: GodTenderBid[] = rawBids
    .map(b => {
      const p = profileById.get(b.provider_id)
      return {
        id: b.id,
        provider_id: b.provider_id ?? null,
        provider_name: p?.full_name ?? null,
        provider_email: p?.email ?? null,
        provider_type: p?.provider_type ?? null,
        amount: num(b.amount),
        eta_weeks: num(b.eta_weeks),
        scope_summary: b.scope_summary ?? null,
        status: b.status ?? null,
        is_awarded:
          !!t.awarded_provider_id && b.provider_id === t.awarded_provider_id,
        created_at: b.created_at ?? null,
      }
    })
    // Sort by amount ascending; bids with no amount sink to the bottom.
    .sort((a, b) => {
      if (a.amount == null && b.amount == null) return 0
      if (a.amount == null) return 1
      if (b.amount == null) return -1
      return a.amount - b.amount
    })

  const awarded = t.awarded_provider_id
    ? profileById.get(t.awarded_provider_id)
    : null

  return {
    id: t.id,
    building_id: t.building_id ?? null,
    building_address: buildingAddress,
    project_id: projectId,
    created_by: t.created_by ?? null,
    title: t.title ?? null,
    description: t.description ?? null,
    scope: t.scope ?? null,
    budget_min: num(t.budget_min),
    budget_max: num(t.budget_max),
    deadline_at: t.deadline_at ?? null,
    status: (t.status ?? null) as TenderStatus | null,
    awarded_provider_id: t.awarded_provider_id ?? null,
    awarded_provider_name: awarded?.full_name ?? null,
    created_at: t.created_at ?? null,
    updated_at: t.updated_at ?? null,
    bids,
  }
}

// Re-read the live tender title + status — used by forceAward / cancelTender to
// verify the typed confirmation string against reality before mutating.
export async function getTenderConfirmRow(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; title: string | null; status: string | null } | null> {
  const { data, error } = await db
    .from('sc_tenders')
    .select('id, title, status')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { id: data.id, title: data.title ?? null, status: data.status ?? null }
}

// ── Writes ───────────────────────────────────────────────────────────────────
// setTenderStatus — plain lifecycle move. Refuses no-op transitions and any move
// out of the terminal 'awarded' state (use forceAward to award; there is no
// "un-award" through this surface). Throws the raw PostgrestError on a CHECK
// violation so the router can translate it.
export async function setTenderStatus(
  db: SupabaseClient,
  id: string,
  status: TenderStatus,
): Promise<{ id: string; status: string }> {
  const live = await getTenderConfirmRow(db, id)
  if (!live) throw new Error('NOT_FOUND')
  if (live.status === status) {
    throw new TenderPreconditionError('המכרז כבר נמצא בסטטוס המבוקש')
  }
  if (live.status === 'awarded') {
    throw new TenderPreconditionError(
      'לא ניתן לשנות סטטוס של מכרז שכבר הוכרז זוכה דרך מסך זה',
    )
  }
  if (status === 'awarded') {
    throw new TenderPreconditionError(
      'הכרזת זוכה מתבצעת דרך פעולת "כפה זכייה" (forceAward) בלבד',
    )
  }
  const { data, error } = await db
    .from('sc_tenders')
    .update({ status })
    .eq('id', id)
    .select('id, status')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return { id: data.id, status: data.status }
}

// forceAward — the result-overriding, dangerous op. BYPASSES the normal poll/bid
// flow. Sequence (best-effort atomic, audited by godMutation):
//   1. validate the bid belongs to this tender + resolve the provider
//   2. set the tender awarded_provider_id + status='awarded'
//   3. set the chosen bid status='accepted', all OTHER bids status='rejected'
//   4. upsert sc_project_providers(project_id, provider_id, role_in_project)
//      using the provider's provider_type as role_in_project (UNIQUE conflict →
//      idempotent upsert, never a 23505).
export async function forceAward(
  db: SupabaseClient,
  tenderId: string,
  bidId: string,
): Promise<{
  id: string
  awarded_provider_id: string
  linked: boolean
}> {
  // 1. The bid must exist AND belong to this tender.
  const { data: bid, error: bidErr } = await db
    .from('sc_tender_bids')
    .select('id, tender_id, provider_id')
    .eq('id', bidId)
    .maybeSingle()
  if (bidErr) throw new Error(bidErr.message)
  if (!bid || bid.tender_id !== tenderId) {
    throw new TenderPreconditionError('ההצעה שנבחרה אינה שייכת למכרז זה')
  }
  if (!bid.provider_id) {
    throw new TenderPreconditionError('להצעה הנבחרת אין ספק משויך')
  }
  const providerId = bid.provider_id as string

  // Resolve the building's project id + the provider's type for the link record.
  const { data: tender, error: tErr } = await db
    .from('sc_tenders')
    .select('id, building_id, status')
    .eq('id', tenderId)
    .maybeSingle()
  if (tErr) throw new Error(tErr.message)
  if (!tender) throw new Error('NOT_FOUND')

  let projectId: string | null = null
  if (tender.building_id) {
    const { data: pj } = await db
      .from('sc_projects')
      .select('id')
      .eq('building_id', tender.building_id)
      .order('created_at', { ascending: false })
      .limit(1)
    projectId = ((pj ?? [])[0] as any)?.id ?? null
  }

  const { data: prov } = await db
    .from('sc_profiles')
    .select('id, provider_type, role')
    .eq('id', providerId)
    .maybeSingle()
  if (!prov) {
    throw new TenderPreconditionError('הספק של ההצעה אינו קיים במערכת')
  }
  const roleInProject = (prov as any).provider_type ?? 'generic'

  // 2. Award on the tender.
  {
    const { error } = await db
      .from('sc_tenders')
      .update({ awarded_provider_id: providerId, status: 'awarded' })
      .eq('id', tenderId)
    if (error) throw error
  }

  // 3. Accept the chosen bid; reject every other bid on this tender.
  {
    const { error: accErr } = await db
      .from('sc_tender_bids')
      .update({ status: 'accepted' })
      .eq('id', bidId)
    if (accErr) throw accErr
    // Reject only the still-open ('submitted') competing bids. A bid that was
    // already 'withdrawn' (or otherwise terminal) keeps its status so the deal
    // history stays honest — we don't rewrite a withdrawal into a rejection.
    const { error: rejErr } = await db
      .from('sc_tender_bids')
      .update({ status: 'rejected' })
      .eq('tender_id', tenderId)
      .eq('status', 'submitted')
      .neq('id', bidId)
    if (rejErr) throw rejErr
  }

  // 4. Link the provider to the project (idempotent upsert on the UNIQUE
  //    (project_id, provider_id)). Skipped only if the building has no project.
  let linked = false
  if (projectId) {
    const { error: linkErr } = await db
      .from('sc_project_providers')
      .upsert(
        {
          project_id: projectId,
          provider_id: providerId,
          role_in_project: roleInProject,
        },
        { onConflict: 'project_id,provider_id' },
      )
    if (linkErr) throw linkErr
    linked = true
  }

  return { id: tenderId, awarded_provider_id: providerId, linked }
}

// cancelTender — force-cancel. Refuses cancelling an already-cancelled tender.
// Does NOT touch the awarded provider link (cancelling after an award is a
// distinct concern; this op only flips the tender status).
export async function cancelTender(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; status: string }> {
  const live = await getTenderConfirmRow(db, id)
  if (!live) throw new Error('NOT_FOUND')
  if (live.status === 'cancelled') {
    throw new TenderPreconditionError('המכרז כבר מבוטל')
  }
  const { data, error } = await db
    .from('sc_tenders')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select('id, status')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return { id: data.id, status: data.status }
}
