import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GodFamilyInvitationListInput,
  GodFamilyInvitationItem,
  GodFamilyLinkListInput,
  GodFamilyLinkItem,
  GodInspectionListInput,
  GodInspectionItem,
  GodRatingListInput,
  GodRatingItem,
  GodCalendarListInput,
  GodCalendarItem,
  GodMiscCounts,
} from '@asset-rise/shared/schemas/godMisc'

// God-mode "Cross-domain Admin / Misc" repo (Wave 3 — content + comms). Runs as
// service-role (adminClient) so it reads/writes any sc_* row, bypassing RLS.
// Routers gate access; repos only do DB work. All writes are wrapped by
// godMutation() at the router layer.
//
// READ-FIRST domain: cross-building read lists + counts for family / inspections
// / ratings / calendar+meetings, plus a few targeted moderation writes:
//   removeFamilyMember  — SOFT-remove a sc_family_links row (set removed_at)
//   cancelInspection    — DELETE a sc_inspections row (no 'cancelled' status)
//   setRatingVerified   — flip sc_provider_ratings.verified (reversible)
//   removeRating        — DELETE a sc_provider_ratings row (trigger recomputes)
//
// All column names were ground-truthed against the silver-castle migrations
// (047/048 family, 017 inspections, 018/062 ratings, 027/055 calendar/meetings).

// Postgres FK-violation SQLSTATE (a delete blocked by a child row, etc.). The
// router translates it to a friendly Hebrew message instead of a 500.
export const PG_FK_VIOLATION = '23503'

// PostgREST treats comma/parens specially inside .or() and % _ * are LIKE
// metacharacters — strip them so a term can't broaden into a match-everything
// dump (same hardening as the other god repos).
function sanitizeTerm(q: string): string {
  return q.replace(/[(),%_*\\]/g, ' ').trim()
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

function matchesTerm(haystacks: (string | null | undefined)[], safe: string): boolean {
  if (!safe) return true
  return haystacks
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(safe)
}

// ── Batch resolvers ───────────────────────────────────────────────────────────
async function resolveProfiles(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { full_name: string | null; email: string | null }>> {
  const map = new Map<string, any>()
  const uniq = Array.from(new Set(ids.filter(Boolean)))
  if (!uniq.length) return map
  const { data } = await db.from('sc_profiles').select('id, full_name, email').in('id', uniq)
  for (const p of (data ?? []) as any[]) map.set(p.id, p)
  return map
}

async function resolveProjects(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { name: string | null; building_id: string | null }>> {
  const map = new Map<string, any>()
  const uniq = Array.from(new Set(ids.filter(Boolean)))
  if (!uniq.length) return map
  const { data } = await db.from('sc_projects').select('id, name, building_id').in('id', uniq)
  for (const p of (data ?? []) as any[]) map.set(p.id, p)
  return map
}

async function resolveBuildings(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { city: string | null; street: string | null; building_number: string | null }>> {
  const map = new Map<string, any>()
  const uniq = Array.from(new Set(ids.filter(Boolean)))
  if (!uniq.length) return map
  const { data } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .in('id', uniq)
  for (const b of (data ?? []) as any[]) map.set(b.id, b)
  return map
}

// ── FAMILY — invitations ──────────────────────────────────────────────────────
export async function listFamilyInvitations(
  db: SupabaseClient,
  input: GodFamilyInvitationListInput,
): Promise<GodFamilyInvitationItem[]> {
  let q = db
    .from('sc_family_invitations')
    .select(
      'id, primary_user_id, invitee_email, invitee_name, status, created_at, accepted_at, cancelled_at, expires_at, accepted_by_user_id',
    )
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200)
  if (input.status) q = q.eq('status', input.status)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]
  if (!rows.length) return []

  const profileIds: string[] = []
  for (const r of rows) {
    if (r.primary_user_id) profileIds.push(r.primary_user_id)
    if (r.accepted_by_user_id) profileIds.push(r.accepted_by_user_id)
  }
  const profileById = await resolveProfiles(db, profileIds)

  const safe = input.q ? sanitizeTerm(input.q).toLowerCase() : ''
  return rows
    .map(r => {
      const primary = r.primary_user_id ? profileById.get(r.primary_user_id) : null
      const accepted = r.accepted_by_user_id ? profileById.get(r.accepted_by_user_id) : null
      return {
        id: r.id,
        primary_user_id: r.primary_user_id ?? null,
        primary_name: primary?.full_name ?? null,
        primary_email: primary?.email ?? null,
        invitee_email: r.invitee_email ?? null,
        invitee_name: r.invitee_name ?? null,
        status: r.status ?? null,
        created_at: r.created_at ?? null,
        accepted_at: r.accepted_at ?? null,
        cancelled_at: r.cancelled_at ?? null,
        expires_at: r.expires_at ?? null,
        accepted_by_user_id: r.accepted_by_user_id ?? null,
        accepted_by_name: accepted?.full_name ?? null,
      } as GodFamilyInvitationItem
    })
    .filter(i =>
      matchesTerm([i.primary_name, i.primary_email, i.invitee_email, i.invitee_name], safe),
    )
}

// ── FAMILY — links (members) ────────────────────────────────────────────────────
export async function listFamilyLinks(
  db: SupabaseClient,
  input: GodFamilyLinkListInput,
): Promise<GodFamilyLinkItem[]> {
  let q = db
    .from('sc_family_links')
    .select(
      'id, primary_user_id, member_user_id, member_display_name, created_at, removed_at',
    )
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200)
  // Active only unless include_removed — "active" = removed_at IS NULL.
  if (!input.include_removed) q = q.is('removed_at', null)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]
  if (!rows.length) return []

  const profileIds: string[] = []
  for (const r of rows) {
    if (r.primary_user_id) profileIds.push(r.primary_user_id)
    if (r.member_user_id) profileIds.push(r.member_user_id)
  }
  const profileById = await resolveProfiles(db, profileIds)

  const safe = input.q ? sanitizeTerm(input.q).toLowerCase() : ''
  return rows
    .map(r => {
      const primary = r.primary_user_id ? profileById.get(r.primary_user_id) : null
      const member = r.member_user_id ? profileById.get(r.member_user_id) : null
      return {
        id: r.id,
        primary_user_id: r.primary_user_id ?? null,
        primary_name: primary?.full_name ?? null,
        primary_email: primary?.email ?? null,
        member_user_id: r.member_user_id ?? null,
        member_name: member?.full_name ?? null,
        member_email: member?.email ?? null,
        member_display_name: r.member_display_name ?? null,
        created_at: r.created_at ?? null,
        removed_at: r.removed_at ?? null,
      } as GodFamilyLinkItem
    })
    .filter(i =>
      matchesTerm(
        [i.primary_name, i.primary_email, i.member_name, i.member_email, i.member_display_name],
        safe,
      ),
    )
}

// removeFamilyMember — SOFT-remove a link (set removed_at = now()). Idempotent:
// only flips rows whose removed_at is still null, so re-removing returns null and
// the router surfaces a friendly "already removed / not found". Returns the
// resolved member label for the audit meta.
export async function removeFamilyMember(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; member_user_id: string | null; primary_user_id: string | null } | null> {
  const { data, error } = await db
    .from('sc_family_links')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', id)
    .is('removed_at', null)
    .select('id, member_user_id, primary_user_id')
    .maybeSingle()
  if (error) throw error
  return (data as any) ?? null
}

// Load a link's resolved member/primary labels (for the audit meta + the
// not-found-vs-already-removed distinction).
export async function getFamilyLinkLabels(
  db: SupabaseClient,
  id: string,
): Promise<{ exists: boolean; member_name: string | null; removed: boolean }> {
  const { data, error } = await db
    .from('sc_family_links')
    .select('id, member_user_id, member_display_name, removed_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return { exists: false, member_name: null, removed: false }
  let memberName = (data as any).member_display_name ?? null
  if (!memberName && (data as any).member_user_id) {
    const map = await resolveProfiles(db, [(data as any).member_user_id])
    memberName = map.get((data as any).member_user_id)?.full_name ?? null
  }
  return { exists: true, member_name: memberName, removed: !!(data as any).removed_at }
}

// ── INSPECTIONS ────────────────────────────────────────────────────────────────
export async function listInspections(
  db: SupabaseClient,
  input: GodInspectionListInput,
): Promise<GodInspectionItem[]> {
  let q = db
    .from('sc_inspections')
    .select(
      'id, project_id, provider_id, inspection_type, slot, title, score, status, submitted_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200)
  if (input.status) q = q.eq('status', input.status)
  if (input.project_id) q = q.eq('project_id', input.project_id)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]
  if (!rows.length) return []

  const projectById = await resolveProjects(db, rows.map(r => r.project_id).filter(Boolean))
  const buildingById = await resolveBuildings(
    db,
    Array.from(projectById.values()).map(p => p.building_id).filter(Boolean) as string[],
  )
  const providerById = await resolveProfiles(db, rows.map(r => r.provider_id).filter(Boolean))

  const safe = input.q ? sanitizeTerm(input.q).toLowerCase() : ''
  return rows
    .map(r => {
      const project = r.project_id ? projectById.get(r.project_id) : null
      const building = project?.building_id ? buildingById.get(project.building_id) : null
      const provider = r.provider_id ? providerById.get(r.provider_id) : null
      return {
        id: r.id,
        project_id: r.project_id ?? null,
        project_name: project?.name ?? null,
        building_address: addressOf(building),
        provider_id: r.provider_id ?? null,
        provider_name: provider?.full_name ?? null,
        inspection_type: r.inspection_type ?? null,
        slot: r.slot ?? null,
        title: r.title ?? null,
        score: r.score ?? null,
        status: r.status ?? null,
        submitted_at: r.submitted_at ?? null,
        created_at: r.created_at ?? null,
      } as GodInspectionItem
    })
    .filter(i =>
      matchesTerm([i.project_name, i.building_address, i.provider_name, i.title, i.inspection_type], safe),
    )
}

// cancelInspection — DELETE the inspection row (there is no 'cancelled' status in
// the CHECK constraint). sc_inspection_files cascade off it. Returns the deleted
// row's label fields for the audit meta, or null if nothing matched.
export async function cancelInspection(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; project_id: string | null; inspection_type: string | null } | null> {
  const { data, error } = await db
    .from('sc_inspections')
    .delete()
    .eq('id', id)
    .select('id, project_id, inspection_type')
    .maybeSingle()
  if (error) throw error
  return (data as any) ?? null
}

// ── RATINGS ──────────────────────────────────────────────────────────────────
export async function listRatings(
  db: SupabaseClient,
  input: GodRatingListInput,
): Promise<GodRatingItem[]> {
  let q = db
    .from('sc_provider_ratings')
    .select(
      'id, provider_id, source, rating, review_count, review_text, external_url, verified, submitted_by, project_id, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200)
  if (input.source) q = q.eq('source', input.source)
  if (input.provider_id) q = q.eq('provider_id', input.provider_id)
  if (input.verified !== undefined) q = q.eq('verified', input.verified)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]
  if (!rows.length) return []

  const profileIds: string[] = []
  for (const r of rows) {
    if (r.provider_id) profileIds.push(r.provider_id)
    if (r.submitted_by) profileIds.push(r.submitted_by)
  }
  const profileById = await resolveProfiles(db, profileIds)

  const safe = input.q ? sanitizeTerm(input.q).toLowerCase() : ''
  return rows
    .map(r => {
      const provider = r.provider_id ? profileById.get(r.provider_id) : null
      const submitter = r.submitted_by ? profileById.get(r.submitted_by) : null
      return {
        id: r.id,
        provider_id: r.provider_id ?? null,
        provider_name: provider?.full_name ?? null,
        source: r.source ?? null,
        rating: r.rating === null || r.rating === undefined ? null : Number(r.rating),
        review_count: r.review_count ?? null,
        review_text: r.review_text ?? null,
        external_url: r.external_url ?? null,
        verified: !!r.verified,
        submitted_by: r.submitted_by ?? null,
        submitter_name: submitter?.full_name ?? null,
        project_id: r.project_id ?? null,
        created_at: r.created_at ?? null,
      } as GodRatingItem
    })
    .filter(i =>
      matchesTerm([i.provider_name, i.submitter_name, i.review_text, i.source], safe),
    )
}

// setRatingVerified — flip the verified flag (reversible moderation). Returns the
// updated row or null if the id didn't match.
export async function setRatingVerified(
  db: SupabaseClient,
  id: string,
  verified: boolean,
): Promise<{ id: string; verified: boolean; provider_id: string | null } | null> {
  const { data, error } = await db
    .from('sc_provider_ratings')
    .update({ verified })
    .eq('id', id)
    .select('id, verified, provider_id')
    .maybeSingle()
  if (error) throw error
  return (data as any) ?? null
}

// removeRating — DELETE the rating row. The AFTER trigger
// (trg_sc_provider_ratings_recompute) refreshes the cached aggregate on
// sc_provider_profiles. Returns the deleted row's labels for the audit meta.
export async function removeRating(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; provider_id: string | null; source: string | null } | null> {
  const { data, error } = await db
    .from('sc_provider_ratings')
    .delete()
    .eq('id', id)
    .select('id, provider_id, source')
    .maybeSingle()
  if (error) throw error
  return (data as any) ?? null
}

// getRatingLabel — provider/submitter label for the audit meta on a remove.
export async function getRatingLabel(
  db: SupabaseClient,
  id: string,
): Promise<string | null> {
  const { data } = await db
    .from('sc_provider_ratings')
    .select('provider_id, submitted_by')
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const ids = [(data as any).provider_id, (data as any).submitted_by].filter(Boolean) as string[]
  const map = await resolveProfiles(db, ids)
  return (
    (((data as any).provider_id && map.get((data as any).provider_id)?.full_name) ||
      ((data as any).submitted_by && map.get((data as any).submitted_by)?.full_name)) ??
    null
  )
}

// ── CALENDAR (read-only) ────────────────────────────────────────────────────────
export async function listCalendarEvents(
  db: SupabaseClient,
  input: GodCalendarListInput,
): Promise<GodCalendarItem[]> {
  let q = db
    .from('sc_calendar_events')
    .select(
      'id, building_id, project_id, created_by, kind, title, starts_at, ends_at, location, created_at',
    )
    .order('starts_at', { ascending: false })
    .limit(input.limit ?? 200)
  if (input.kind) q = q.eq('kind', input.kind)
  if (input.building_id) q = q.eq('building_id', input.building_id)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]
  if (!rows.length) return []

  const buildingById = await resolveBuildings(db, rows.map(r => r.building_id).filter(Boolean))
  const projectById = await resolveProjects(db, rows.map(r => r.project_id).filter(Boolean))
  // created_by references auth.users; sc_profiles shares the same id space.
  const creatorById = await resolveProfiles(db, rows.map(r => r.created_by).filter(Boolean))

  const safe = input.q ? sanitizeTerm(input.q).toLowerCase() : ''
  return rows
    .map(r => {
      const building = r.building_id ? buildingById.get(r.building_id) : null
      const project = r.project_id ? projectById.get(r.project_id) : null
      const creator = r.created_by ? creatorById.get(r.created_by) : null
      return {
        id: r.id,
        building_id: r.building_id ?? null,
        building_address: addressOf(building),
        project_id: r.project_id ?? null,
        project_name: project?.name ?? null,
        created_by: r.created_by ?? null,
        creator_name: creator?.full_name ?? null,
        kind: r.kind ?? null,
        title: r.title ?? null,
        starts_at: r.starts_at ?? null,
        ends_at: r.ends_at ?? null,
        location: r.location ?? null,
        created_at: r.created_at ?? null,
      } as GodCalendarItem
    })
    .filter(i => matchesTerm([i.title, i.building_address, i.project_name, i.creator_name, i.location], safe))
}

// ── Counts (header dashboard) ───────────────────────────────────────────────────
async function countRows(db: SupabaseClient, table: string, activeOnly?: 'family_links'): Promise<number> {
  let q = db.from(table).select('id', { count: 'exact', head: true })
  if (activeOnly === 'family_links') q = q.is('removed_at', null)
  const { count, error } = await q
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function getMiscCounts(db: SupabaseClient): Promise<GodMiscCounts> {
  const [
    family_invitations,
    family_links_active,
    inspections,
    ratings,
    calendar_events,
    meetings,
  ] = await Promise.all([
    countRows(db, 'sc_family_invitations'),
    countRows(db, 'sc_family_links', 'family_links'),
    countRows(db, 'sc_inspections'),
    countRows(db, 'sc_provider_ratings'),
    countRows(db, 'sc_calendar_events'),
    countRows(db, 'sc_negotiation_meetings'),
  ])
  return { family_invitations, family_links_active, inspections, ratings, calendar_events, meetings }
}
