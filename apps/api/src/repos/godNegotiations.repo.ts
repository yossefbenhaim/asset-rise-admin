import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GodNegotiationListInput,
  GodNegotiationListItem,
  GodNegotiationDetail,
  GodNegotiationMessage,
  GodNegForceStageInput,
  GodNegForceStatusInput,
} from '@asset-rise/shared'

// God-mode "Provider Negotiations" repo (Wave 2 — "deals"). Runs as
// service-role (adminClient) so it reads/writes any sc_* row, bypassing RLS.
// Routers gate access; repos only do DB work. All writes are wrapped by
// godMutation() at the router layer.
//
// IMPORTANT — god overrides bypass the normal flow. In silver-castle a
// negotiation is finalized through openMutualPoll → tenant vote →
// negotiation-finalize.ts, which flips status to confirmed/rejected, sets
// stage='linked' and INSERTs sc_project_providers. The link/unlink helpers here
// write sc_project_providers DIRECTLY, with NO poll and NO tenant vote. Forcing
// status/stage likewise does not touch the poll. This is intentional god
// override behavior and is fully audited at the router layer.

// Postgres unique-violation SQLSTATE — a duplicate sc_project_providers insert
// (same project+provider) trips this; the router translates it to a friendly
// Hebrew message instead of a 500.
export const PG_UNIQUE_VIOLATION = '23505'
// FK-violation SQLSTATE — e.g. linking a provider id that isn't a real profile.
export const PG_FK_VIOLATION = '23503'

function addressOf(
  b:
    | {
        street?: string | null
        building_number?: string | null
        city?: string | null
      }
    | null
    | undefined,
): string | null {
  if (!b) return null
  const line = [b.street, b.building_number].filter(Boolean).join(' ')
  const full = [line, b.city].filter(Boolean).join(', ').trim()
  return full || null
}

// PostgREST treats comma/parens specially inside .or() and % _ * are LIKE
// metacharacters — strip them so a term can't broaden into a match-everything
// dump (same hardening as the other god repos).
function sanitizeTerm(q: string): string {
  return q.replace(/[(),%_*\\]/g, ' ').trim()
}

// ── List ─────────────────────────────────────────────────────────────────────
// All negotiations + the resolved building address / project name / chair +
// provider names + a per-negotiation message count. Filters by status/stage/
// building/project; the free-text term matches the result_summary and the
// resolved building address / chair name / provider name (post-resolution, so
// the search isn't limited to columns the negotiations table carries).
export async function listNegotiations(
  db: SupabaseClient,
  input: GodNegotiationListInput,
): Promise<GodNegotiationListItem[]> {
  let q = db
    .from('sc_provider_negotiations')
    .select(
      'id, building_id, project_id, chair_id, provider_id, provider_type, status, stage, poll_id, result_summary, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200)

  if (input.status) q = q.eq('status', input.status)
  if (input.stage) q = q.eq('stage', input.stage)
  if (input.building_id) q = q.eq('building_id', input.building_id)
  if (input.project_id) q = q.eq('project_id', input.project_id)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]
  if (!rows.length) return []

  // Batch-resolve the referenced buildings, projects, and profiles.
  const buildingIds = new Set<string>()
  const projectIds = new Set<string>()
  const profileIds = new Set<string>()
  const negIds: string[] = []
  for (const r of rows) {
    if (r.building_id) buildingIds.add(r.building_id)
    if (r.project_id) projectIds.add(r.project_id)
    if (r.chair_id) profileIds.add(r.chair_id)
    if (r.provider_id) profileIds.add(r.provider_id)
    if (r.id) negIds.push(r.id)
  }

  const [buildingById, projectById, profileById, countByNeg] = await Promise.all([
    resolveBuildings(db, Array.from(buildingIds)),
    resolveProjects(db, Array.from(projectIds)),
    resolveProfiles(db, Array.from(profileIds)),
    countMessages(db, negIds),
  ])

  let items: GodNegotiationListItem[] = rows.map(r => {
    const chair = r.chair_id ? profileById.get(r.chair_id) : null
    const provider = r.provider_id ? profileById.get(r.provider_id) : null
    return {
      id: r.id,
      building_id: r.building_id ?? null,
      project_id: r.project_id ?? null,
      building_address: addressOf(buildingById.get(r.building_id) ?? null),
      project_name: (projectById.get(r.project_id)?.name ?? null) as string | null,
      chair_id: r.chair_id ?? null,
      chair_name: chair?.full_name ?? null,
      provider_id: r.provider_id ?? null,
      provider_name: provider?.full_name ?? null,
      provider_type: r.provider_type ?? null,
      status: r.status ?? null,
      stage: r.stage ?? null,
      poll_id: r.poll_id ?? null,
      message_count: countByNeg.get(r.id) ?? 0,
      result_summary: r.result_summary ?? null,
    }
  })

  const safe = input.q ? sanitizeTerm(input.q).toLowerCase() : ''
  if (safe) {
    items = items.filter(i =>
      [i.building_address, i.project_name, i.chair_name, i.provider_name, i.result_summary]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(safe),
    )
  }

  return items
}

// ── Detail (+ messages) ─────────────────────────────────────────────────────
export async function getNegotiation(
  db: SupabaseClient,
  id: string,
): Promise<GodNegotiationDetail | null> {
  const { data: n, error } = await db
    .from('sc_provider_negotiations')
    .select(
      'id, building_id, project_id, chair_id, provider_id, provider_type, status, stage, poll_id, result_summary, created_at',
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!n) return null

  const profileIds = [n.chair_id, n.provider_id].filter(Boolean) as string[]
  const [buildingById, projectById, profileById] = await Promise.all([
    n.building_id ? resolveBuildings(db, [n.building_id]) : Promise.resolve(new Map()),
    n.project_id ? resolveProjects(db, [n.project_id]) : Promise.resolve(new Map()),
    resolveProfiles(db, profileIds),
  ])

  // Messages — resolve sender names in one batched pass.
  const { data: msgRows } = await db
    .from('sc_negotiation_messages')
    .select('id, sender_id, body, meta, created_at')
    .eq('negotiation_id', id)
    .order('created_at', { ascending: true })
  const msgs = (msgRows ?? []) as any[]
  const senderIds = Array.from(new Set(msgs.map(m => m.sender_id).filter(Boolean) as string[]))
  const senderById = await resolveProfiles(db, senderIds)
  const messages: GodNegotiationMessage[] = msgs.map(m => ({
    id: m.id,
    sender_id: m.sender_id ?? null,
    sender_name: m.sender_id ? (senderById.get(m.sender_id)?.full_name ?? null) : null,
    body: m.body ?? null,
    meta: (m.meta ?? null) as Record<string, unknown> | null,
    created_at: m.created_at ?? null,
  }))

  // Is this provider already linked to the project (sc_project_providers)?
  const is_linked = await providerIsLinked(db, n.project_id, n.provider_id)

  const chair = n.chair_id ? profileById.get(n.chair_id) : null
  const provider = n.provider_id ? profileById.get(n.provider_id) : null

  return {
    id: n.id,
    building_id: n.building_id ?? null,
    project_id: n.project_id ?? null,
    building_address: addressOf(buildingById.get(n.building_id) ?? null),
    project_name: (projectById.get(n.project_id)?.name ?? null) as string | null,
    chair_id: n.chair_id ?? null,
    chair_name: chair?.full_name ?? null,
    chair_email: chair?.email ?? null,
    provider_id: n.provider_id ?? null,
    provider_name: provider?.full_name ?? null,
    provider_email: provider?.email ?? null,
    provider_type: n.provider_type ?? null,
    status: n.status ?? null,
    stage: n.stage ?? null,
    poll_id: n.poll_id ?? null,
    result_summary: n.result_summary ?? null,
    created_at: n.created_at ?? null,
    is_linked,
    messages,
  }
}

// Load just enough of a negotiation to drive the link/unlink/force writes,
// returning the resolved project/provider/type (used for defaulting + the
// audit meta). Throws 'NOT_FOUND' if the negotiation doesn't exist.
export async function loadNegotiationTarget(
  db: SupabaseClient,
  id: string,
): Promise<{
  id: string
  project_id: string | null
  provider_id: string | null
  provider_type: string | null
  status: string | null
  stage: string | null
}> {
  const { data, error } = await db
    .from('sc_provider_negotiations')
    .select('id, project_id, provider_id, provider_type, status, stage')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('NOT_FOUND')
  return {
    id: data.id,
    project_id: data.project_id ?? null,
    provider_id: data.provider_id ?? null,
    provider_type: data.provider_type ?? null,
    status: data.status ?? null,
    stage: data.stage ?? null,
  }
}

// ── Writes (pure overrides — no poll, no tenant vote) ────────────────────────
export async function forceStage(db: SupabaseClient, input: GodNegForceStageInput) {
  const { data, error } = await db
    .from('sc_provider_negotiations')
    .update({ stage: input.stage })
    .eq('id', input.id)
    .select('id, stage')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return data
}

export async function forceStatus(db: SupabaseClient, input: GodNegForceStatusInput) {
  const { data, error } = await db
    .from('sc_provider_negotiations')
    .update({ status: input.status })
    .eq('id', input.id)
    .select('id, status')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return data
}

// linkProvider — UPSERT sc_project_providers(project_id, provider_id,
// role_in_project) directly. The negotiation's provider_type maps to the
// canonical `role_in_project` column (the real table — silver-castle migration
// 015_project_providers.sql — has NO `provider_type` column; the same mapping
// is done by negotiation-finalize.ts and god.tenders forceAward). Bypasses
// openMutualPoll/finalize. Idempotent on the UNIQUE(project_id, provider_id)
// constraint (ignoreDuplicates), mirroring the canonical writers, so a repeat
// link is a no-op rather than a unique-violation. Throws the raw PostgrestError
// on FK violation so the router can translate the code.
export async function linkProvider(
  db: SupabaseClient,
  args: { project_id: string; provider_id: string; provider_type: string },
) {
  const { data, error } = await db
    .from('sc_project_providers')
    .upsert(
      {
        project_id: args.project_id,
        provider_id: args.provider_id,
        role_in_project: args.provider_type,
      },
      { onConflict: 'project_id,provider_id', ignoreDuplicates: true },
    )
    .select('project_id, provider_id, role_in_project')
    .maybeSingle()
  if (error) throw error
  return data
}

// unlinkProvider — DELETE the sc_project_providers row matching project+provider.
// Returns the deleted row (or null if nothing matched).
export async function unlinkProvider(
  db: SupabaseClient,
  args: { project_id: string; provider_id: string },
) {
  const { data, error } = await db
    .from('sc_project_providers')
    .delete()
    .eq('project_id', args.project_id)
    .eq('provider_id', args.provider_id)
    .select('project_id, provider_id, role_in_project')
    .maybeSingle()
  if (error) throw error
  return data
}

// Does a sc_project_providers row already link this provider to this project?
export async function providerIsLinked(
  db: SupabaseClient,
  projectId: string | null | undefined,
  providerId: string | null | undefined,
): Promise<boolean> {
  if (!projectId || !providerId) return false
  const { data, error } = await db
    .from('sc_project_providers')
    .select('provider_id')
    .eq('project_id', projectId)
    .eq('provider_id', providerId)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return !!data
}

// ── Batch resolvers ───────────────────────────────────────────────────────────
async function resolveBuildings(
  db: SupabaseClient,
  ids: string[],
): Promise<
  Map<string, { city: string | null; street: string | null; building_number: string | null }>
> {
  const map = new Map<string, any>()
  if (!ids.length) return map
  const { data } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .in('id', ids)
  for (const b of (data ?? []) as any[]) map.set(b.id, b)
  return map
}

async function resolveProjects(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { name: string | null }>> {
  const map = new Map<string, any>()
  if (!ids.length) return map
  const { data } = await db.from('sc_projects').select('id, name').in('id', ids)
  for (const p of (data ?? []) as any[]) map.set(p.id, p)
  return map
}

async function resolveProfiles(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { full_name: string | null; email: string | null }>> {
  const map = new Map<string, any>()
  if (!ids.length) return map
  const { data } = await db.from('sc_profiles').select('id, full_name, email').in('id', ids)
  for (const p of (data ?? []) as any[]) map.set(p.id, p)
  return map
}

async function countMessages(db: SupabaseClient, negIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!negIds.length) return map
  const { data } = await db
    .from('sc_negotiation_messages')
    .select('negotiation_id')
    .in('negotiation_id', negIds)
  for (const m of (data ?? []) as any[]) {
    const k = m.negotiation_id as string
    if (k) map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}
