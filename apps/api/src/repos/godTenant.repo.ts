import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GodTenantListInput,
  GodTenantListItem,
  GodTenantDetail,
  GodBuildingOption,
  GodEditTenantProfileInput,
  GodSetVaadRolesInput,
} from '@asset-rise/shared'

// God-mode "Tenants + Vaad" repo. Runs as service-role (adminClient bypasses
// RLS) so it can read/write any sc_* row. Only the god router (super-admin)
// calls these. Writes return enough context for the router's audit meta.

// PostgREST treats comma/parens specially inside .or() and % _ * are LIKE
// metacharacters — strip them so a term can't broaden into a match-everything
// PII dump (same hardening as god.repo.ts sanitizeTerm).
function sanitizeTerm(q: string): string {
  return q.replace(/[(),%_*\\]/g, ' ').trim()
}

function buildingLabel(
  b:
    | {
        city?: string | null
        street?: string | null
        building_number?: string | null
      }
    | null
    | undefined,
): string | null {
  if (!b) return null
  const addr = [b.street, b.building_number].filter(Boolean).join(' ')
  return [addr, b.city].filter(Boolean).join(', ') || null
}

// ── List buildings (for the move-building picker + building filter) ───────────
export async function listBuildingOptions(db: SupabaseClient): Promise<GodBuildingOption[]> {
  const { data, error } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .order('city', { ascending: true })
    .limit(1000)
  if (error) throw new Error(error.message)
  return ((data ?? []) as any[]).map(b => ({
    id: b.id,
    label: buildingLabel(b) || b.id,
  }))
}

// ── List / search tenants ─────────────────────────────────────────────────────
// A tenant is a sc_profiles row with role='tenant'. We left-join the matching
// sc_tenant_profiles row (PostgREST embed) for building/apartment/vaad fields,
// then resolve building addresses in one batched lookup.
export async function listTenants(
  db: SupabaseClient,
  input: GodTenantListInput,
): Promise<GodTenantListItem[]> {
  let q = db
    .from('sc_profiles')
    .select(
      'id, full_name, email, phone, role, ' +
        'tp:sc_tenant_profiles!sc_tenant_profiles_id_fkey(building_id, apartment_number, is_committee_chair, is_committee_member, is_organizer)',
    )
    .eq('role', 'tenant')
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200)

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
    const tp = Array.isArray(r.tp) ? r.tp[0] : r.tp
    return { ...r, tp: tp ?? null }
  })

  // Building filter applies to the tenant's building_id (post-embed).
  const filtered = input.building_id
    ? norm.filter(r => r.tp?.building_id === input.building_id)
    : norm

  // Batch-resolve building addresses.
  const buildingIds = Array.from(
    new Set(filtered.map(r => r.tp?.building_id).filter((x): x is string => !!x)),
  )
  const labelById = new Map<string, string | null>()
  if (buildingIds.length) {
    const { data: bs } = await db
      .from('sc_buildings')
      .select('id, city, street, building_number')
      .in('id', buildingIds)
    for (const b of (bs ?? []) as any[]) labelById.set(b.id, buildingLabel(b))
  }

  return filtered.map(r => ({
    id: r.id,
    full_name: r.full_name ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    role: r.role ?? null,
    building_id: r.tp?.building_id ?? null,
    building_label: r.tp?.building_id ? (labelById.get(r.tp.building_id) ?? null) : null,
    apartment_number: r.tp?.apartment_number ?? null,
    is_committee_chair: !!r.tp?.is_committee_chair,
    is_committee_member: !!r.tp?.is_committee_member,
    is_organizer: !!r.tp?.is_organizer,
  }))
}

// ── Tenant detail (full sc_profiles + full sc_tenant_profiles) ────────────────
export async function getTenant(db: SupabaseClient, id: string): Promise<GodTenantDetail | null> {
  const { data: p, error } = await db
    .from('sc_profiles')
    .select('id, email, full_name, phone, role, provider_type, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!p) return null

  const { data: tp } = await db.from('sc_tenant_profiles').select('*').eq('id', id).maybeSingle()

  let building_label: string | null = null
  const buildingId = (tp as any)?.building_id ?? null
  if (buildingId) {
    const { data: b } = await db
      .from('sc_buildings')
      .select('id, city, street, building_number')
      .eq('id', buildingId)
      .maybeSingle()
    building_label = buildingLabel(b as any)
  }

  // Resolve the reversible auth ban so the UI can show ban state.
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
    provider_type: p.provider_type ?? null,
    created_at: p.created_at ?? null,
    banned,
    tenant_profile: (tp ?? null) as Record<string, unknown> | null,
    building_label,
  }
}

// Confirm the row is a tenant (role='tenant') and return its email. Used by
// writes that should not be aimed at admins/providers and by delete's
// server-side email interlock.
export async function loadTenantTarget(
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

// Ensure a sc_tenant_profiles row exists for the id before updating its
// columns. Tenants generally have one, but a profile created without onboarding
// may not — upsert keeps the vaad/apartment writes idempotent and safe.
async function ensureTenantProfile(db: SupabaseClient, id: string): Promise<void> {
  const { data } = await db.from('sc_tenant_profiles').select('id').eq('id', id).maybeSingle()
  if (!data) {
    const { error } = await db.from('sc_tenant_profiles').insert({ id })
    if (error) throw new Error(error.message)
  }
}

// ── editTenantProfile ─────────────────────────────────────────────────────────
export async function editTenantProfile(
  db: SupabaseClient,
  input: GodEditTenantProfileInput,
): Promise<{ ok: true }> {
  // sc_profiles side (full_name / phone)
  const profilePatch: Record<string, unknown> = {}
  if (input.full_name !== undefined) profilePatch.full_name = input.full_name
  if (input.phone !== undefined) profilePatch.phone = input.phone
  if (Object.keys(profilePatch).length) {
    const { error } = await db.from('sc_profiles').update(profilePatch).eq('id', input.id)
    if (error) throw new Error(error.message)
  }

  // sc_tenant_profiles side (apartment_number / ownership_percentage)
  const tenantPatch: Record<string, unknown> = {}
  if (input.apartment_number !== undefined) tenantPatch.apartment_number = input.apartment_number
  if (input.ownership_percentage !== undefined)
    tenantPatch.ownership_percentage = input.ownership_percentage
  if (Object.keys(tenantPatch).length) {
    await ensureTenantProfile(db, input.id)
    const { error } = await db.from('sc_tenant_profiles').update(tenantPatch).eq('id', input.id)
    if (error) throw new Error(error.message)
  }
  return { ok: true }
}

// ── setVaadRoles ("change the vaad") ──────────────────────────────────────────
export async function setVaadRoles(
  db: SupabaseClient,
  input: GodSetVaadRolesInput,
): Promise<{ ok: true }> {
  const patch: Record<string, unknown> = {}
  if (input.is_committee_chair !== undefined) patch.is_committee_chair = input.is_committee_chair
  if (input.is_committee_member !== undefined) patch.is_committee_member = input.is_committee_member
  if (input.is_organizer !== undefined) patch.is_organizer = input.is_organizer
  if (!Object.keys(patch).length) return { ok: true }

  await ensureTenantProfile(db, input.id)
  const { error } = await db.from('sc_tenant_profiles').update(patch).eq('id', input.id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ── moveBuilding ──────────────────────────────────────────────────────────────
export async function moveBuilding(
  db: SupabaseClient,
  id: string,
  building_id: string,
): Promise<{ ok: true }> {
  // Validate target building exists (FK would catch it, but a clean error is
  // friendlier than a raw FK violation).
  const { data: b, error: bErr } = await db
    .from('sc_buildings')
    .select('id')
    .eq('id', building_id)
    .maybeSingle()
  if (bErr) throw new Error(bErr.message)
  if (!b) throw new Error('BUILDING_NOT_FOUND')

  await ensureTenantProfile(db, id)
  const { error } = await db.from('sc_tenant_profiles').update({ building_id }).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

// ── setBanned (reversible auth ban — reuse of users.ts disable pattern) ───────
export async function setTenantBanned(
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

// ── deleteTenant (HARD delete) ────────────────────────────────────────────────
// Order: delete sc_profiles first (CASCADE removes sc_tenant_profiles + ~40
// child tables) THEN the auth user. The single RESTRICT FK is
// sc_provider_negotiations.chair_id — if this tenant chairs a live negotiation,
// the sc_profiles delete fails with Postgres code 23503; we surface a Hebrew
// message instead of a 500. We delete the profile row before auth.deleteUser so
// the RESTRICT check happens while the auth user still exists (recoverable).
export class FkRestrictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FkRestrictError'
  }
}

export async function deleteTenant(db: SupabaseClient, id: string): Promise<{ ok: true }> {
  const { error: profErr } = await db.from('sc_profiles').delete().eq('id', id)
  if (profErr) {
    // 23503 = foreign_key_violation. The only RESTRICT path is chair_id.
    if ((profErr as any).code === '23503' || /foreign key|23503/i.test(profErr.message)) {
      throw new FkRestrictError(
        'אי אפשר למחוק את הדייר — הוא משמש כיו"ר ועד במשא ומתן פעיל מול ספק. יש להחליף יו"ר בפרויקט לפני המחיקה.',
      )
    }
    throw new Error(profErr.message)
  }
  // Profile (and all CASCADE children) gone — now remove the auth user.
  const { error: authErr } = await db.auth.admin.deleteUser(id)
  if (authErr) throw new Error(authErr.message)
  return { ok: true }
}
