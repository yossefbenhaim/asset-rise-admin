import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PROVIDER_TYPE_TABLE,
  type GodProviderType,
  type GodProviderListInput,
  type GodProviderListItem,
  type GodProviderDetail,
  type GodEditProviderProfileInput,
} from '@asset-rise/shared'

// God-mode "Providers" repo. Runs as service-role (adminClient bypasses RLS)
// so it can read/write any sc_* row. Only the god router (super-admin) calls
// these. Writes return enough context for the router's audit meta.
//
// A provider is a sc_profiles row with role='provider'. provider_type picks the
// per-type license/specialization table (architect/appraiser/lawyer/developer/
// contractor). coordinator + generic have NO per-type table — they carry only
// the common sc_provider_profiles row.

// PostgREST treats comma/parens specially inside .or() and % _ * are LIKE
// metacharacters — strip them so a term can't broaden into a match-everything
// PII dump (same hardening as god.repo.ts / godTenant.repo.ts).
function sanitizeTerm(q: string): string {
  return q.replace(/[(),%_*\\]/g, ' ').trim()
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function ratingFrom(summary: unknown): { avg: number | null; count: number | null } {
  if (!summary || typeof summary !== 'object') return { avg: null, count: null }
  const s = summary as Record<string, unknown>
  return { avg: num(s.avg), count: num(s.count) }
}

// Resolve the per-type table name for a provider_type (null for coordinator/
// generic or an unknown type).
function typeTableFor(providerType: string | null | undefined): string | null {
  if (!providerType) return null
  return PROVIDER_TYPE_TABLE[providerType as GodProviderType] ?? null
}

// ── List / search providers ───────────────────────────────────────────────────
// A provider is a sc_profiles row with role='provider'. We left-join the
// common sc_provider_profiles row (about / completed_projects / rating) via a
// PostgREST embed. The city filter resolves against sc_lawyer_profiles.city in
// a batched lookup (the only per-type table with a free city column), and is
// applied post-embed.
export async function listProviders(
  db: SupabaseClient,
  input: GodProviderListInput,
): Promise<GodProviderListItem[]> {
  let q = db
    .from('sc_profiles')
    .select(
      'id, full_name, email, phone, role, provider_type, ' +
        'pp:sc_provider_profiles!sc_provider_profiles_id_fkey(about, completed_projects, public_rating_summary)',
    )
    .eq('role', 'provider')
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200)

  if (input.provider_type) q = q.eq('provider_type', input.provider_type)

  const safe = input.q ? sanitizeTerm(input.q) : ''
  if (safe) {
    const term = `%${safe}%`
    q = q.or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]

  // Normalize the embed: PostgREST returns the related row as object or array.
  const norm = rows.map(r => {
    const pp = Array.isArray(r.pp) ? r.pp[0] : r.pp
    return { ...r, pp: pp ?? null }
  })

  // Resolve lawyer cities for the rows that are lawyers (the only per-type
  // table with a plain city column) in one batched lookup.
  const lawyerIds = norm.filter(r => r.provider_type === 'lawyer').map(r => r.id)
  const cityById = new Map<string, string | null>()
  if (lawyerIds.length) {
    const { data: lp } = await db
      .from('sc_lawyer_profiles')
      .select('id, city')
      .in('id', lawyerIds)
    for (const l of (lp ?? []) as any[]) cityById.set(l.id, l.city ?? null)
  }

  let items: GodProviderListItem[] = norm.map(r => {
    const rating = ratingFrom(r.pp?.public_rating_summary)
    return {
      id: r.id,
      full_name: r.full_name ?? null,
      email: r.email ?? null,
      phone: r.phone ?? null,
      provider_type: (r.provider_type ?? null) as GodProviderType | null,
      about: r.pp?.about ?? null,
      completed_projects: num(r.pp?.completed_projects),
      rating_avg: rating.avg,
      rating_count: rating.count,
      city: cityById.get(r.id) ?? null,
    }
  })

  // City filter (post-embed): match the resolved per-type city OR the provider
  // name/email so a city term isn't a dead end for non-lawyer providers.
  const cityTerm = input.city ? input.city.trim().toLowerCase() : ''
  if (cityTerm) {
    items = items.filter(i => {
      const hay = [i.city, i.full_name, i.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(cityTerm)
    })
  }

  return items
}

// ── Provider detail ───────────────────────────────────────────────────────────
// Full sc_profiles + the common sc_provider_profiles row + the per-type
// license/specialization row (read-only for Wave 1). Resolves the reversible
// auth ban so the UI can show ban state.
export async function getProvider(
  db: SupabaseClient,
  id: string,
): Promise<GodProviderDetail | null> {
  const { data: p, error } = await db
    .from('sc_profiles')
    .select('id, email, full_name, phone, role, provider_type, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!p) return null

  const { data: pp } = await db
    .from('sc_provider_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  // Per-type license/specialization row (null for coordinator/generic).
  const typeTable = typeTableFor(p.provider_type)
  let typeProfile: Record<string, unknown> | null = null
  if (typeTable) {
    const { data: tp } = await db.from(typeTable).select('*').eq('id', id).maybeSingle()
    typeProfile = (tp ?? null) as Record<string, unknown> | null
  }

  // Reversible auth ban → ban state for the UI.
  let banned = false
  try {
    const { data: authUser } = await db.auth.admin.getUserById(id)
    const until = (authUser?.user as any)?.banned_until
    banned = !!until && new Date(until).getTime() > Date.now()
  } catch {
    banned = false
  }

  return {
    id: p.id,
    email: p.email ?? null,
    full_name: p.full_name ?? null,
    phone: p.phone ?? null,
    role: p.role ?? null,
    provider_type: (p.provider_type ?? null) as GodProviderType | null,
    created_at: p.created_at ?? null,
    banned,
    provider_profile: (pp ?? null) as Record<string, unknown> | null,
    type_table: typeTable,
    type_profile: typeProfile,
  }
}

// Confirm the row is a provider (role='provider') and return its email/role.
// Used by writes that should not be aimed at tenants/admins.
export async function loadProviderTarget(
  db: SupabaseClient,
  id: string,
): Promise<{ email: string | null; role: string | null }> {
  const { data, error } = await db
    .from('sc_profiles')
    .select('email, role')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('NOT_FOUND')
  return { email: data.email ?? null, role: data.role ?? null }
}

// Ensure a sc_provider_profiles row exists before patching its columns. A
// provider created without onboarding may lack one — upsert keeps the about/
// completed_projects writes idempotent and safe.
async function ensureProviderProfile(db: SupabaseClient, id: string): Promise<void> {
  const { data } = await db
    .from('sc_provider_profiles')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  if (!data) {
    const { error } = await db.from('sc_provider_profiles').insert({ id })
    if (error) throw new Error(error.message)
  }
}

// ── editProviderProfile ─────────────────────────────────────────────────────────
// full_name / phone live on sc_profiles; about / completed_projects live on
// sc_provider_profiles. Only provided fields are written.
export async function editProviderProfile(
  db: SupabaseClient,
  input: GodEditProviderProfileInput,
): Promise<{ ok: true }> {
  // sc_profiles side (full_name / phone)
  const profilePatch: Record<string, unknown> = {}
  if (input.full_name !== undefined) profilePatch.full_name = input.full_name
  if (input.phone !== undefined) profilePatch.phone = input.phone
  if (Object.keys(profilePatch).length) {
    const { error } = await db.from('sc_profiles').update(profilePatch).eq('id', input.id)
    if (error) throw new Error(error.message)
  }

  // sc_provider_profiles side (about / completed_projects)
  const ppPatch: Record<string, unknown> = {}
  if (input.about !== undefined) ppPatch.about = input.about
  if (input.completed_projects !== undefined)
    ppPatch.completed_projects = input.completed_projects
  if (Object.keys(ppPatch).length) {
    await ensureProviderProfile(db, input.id)
    const { error } = await db
      .from('sc_provider_profiles')
      .update(ppPatch)
      .eq('id', input.id)
    if (error) throw new Error(error.message)
  }
  return { ok: true }
}

// ── setBanned (reversible auth ban — reuse of users.ts disable pattern) ───────
export async function setProviderBanned(
  db: SupabaseClient,
  id: string,
  banned: boolean,
): Promise<{ ok: true }> {
  const { error } = await db.auth.admin.updateUserById(id, {
    ban_duration: banned ? '876000h' : 'none',
  })
  if (error) throw new Error(error.message)
  return { ok: true }
}
