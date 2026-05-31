import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GodBuildingDetail,
  GodBuildingListItem,
  GodBuildingTenant,
  GodEditBuildingInput,
  GodForceProjectStageInput,
  GodLinkedProvider,
  GodProviderOption,
  GodReassignRoleInput,
  GodRoleRef,
} from '@asset-rise/shared'

// God-mode Buildings + Projects repo. Runs as service-role (adminClient) so it
// reads/writes any sc_* row, bypassing RLS. Routers gate access; repos only do
// DB work. All writes are wrapped by godMutation() at the router layer.

// Postgres FK-violation SQLSTATE. A hard building delete can be blocked by an
// ON DELETE RESTRICT/NO ACTION reference (e.g. sc_provider_negotiations.chair_id
// → sc_profiles is RESTRICT; other tables may restrict against the project).
export const PG_FK_VIOLATION = '23503'

// Map a project's active-role slot to its sc_projects column.
const SLOT_COLUMN: Record<GodReassignRoleInput['slot'], string> = {
  coordinator: 'active_coordinator_id',
  lawyer: 'active_lawyer_id',
  developer: 'active_developer_id',
}

function addressOf(b: { street?: string | null; building_number?: string | null; city?: string | null }): string {
  const line = [b.street, b.building_number].filter(Boolean).join(' ')
  return [line, b.city].filter(Boolean).join(', ').trim()
}

// ── List ─────────────────────────────────────────────────────────────────────
// All buildings + tenant count + project count + the project's current_stage.
export async function listBuildings(db: SupabaseClient): Promise<GodBuildingListItem[]> {
  const { data: buildings, error } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw new Error(error.message)
  if (!buildings?.length) return []

  const ids = (buildings as any[]).map(b => b.id)
  const [{ data: tenants }, { data: projects }] = await Promise.all([
    db.from('sc_tenant_profiles').select('building_id').in('building_id', ids),
    db.from('sc_projects').select('building_id, current_stage').in('building_id', ids),
  ])

  const tenantCount = new Map<string, number>()
  for (const t of (tenants ?? []) as any[]) {
    const k = t.building_id as string
    if (k) tenantCount.set(k, (tenantCount.get(k) ?? 0) + 1)
  }
  const projCount = new Map<string, number>()
  const stageByBuilding = new Map<string, string | null>()
  for (const p of (projects ?? []) as any[]) {
    const k = p.building_id as string
    if (!k) continue
    projCount.set(k, (projCount.get(k) ?? 0) + 1)
    if (!stageByBuilding.has(k)) stageByBuilding.set(k, p.current_stage ?? null)
  }

  return (buildings as any[]).map(b => ({
    id: b.id,
    city: b.city ?? null,
    street: b.street ?? null,
    building_number: b.building_number ?? null,
    address: addressOf(b),
    tenant_count: tenantCount.get(b.id) ?? 0,
    project_count: projCount.get(b.id) ?? 0,
    current_stage: stageByBuilding.get(b.id) ?? null,
  }))
}

// ── Detail ───────────────────────────────────────────────────────────────────
export async function getBuildingDetail(
  db: SupabaseClient,
  id: string,
): Promise<GodBuildingDetail | null> {
  const { data: b, error } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!b) return null

  // One project per building (sc_projects has UNIQUE(building_id)); take the
  // newest defensively in case of stray duplicates.
  const { data: projRows } = await db
    .from('sc_projects')
    .select(
      'id, name, current_stage, target_quarter, active_coordinator_id, active_lawyer_id, active_developer_id',
    )
    .eq('building_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
  const proj = (projRows ?? [])[0] as any | undefined

  // Collect every profile id referenced by the project's active-role slots and
  // by its linked providers, then batch-resolve names/emails/types in one pass.
  let linkedRaw: any[] = []
  if (proj) {
    const { data: pp } = await db
      .from('sc_project_providers')
      .select('provider_id, role_in_project, added_at')
      .eq('project_id', proj.id)
      .order('added_at', { ascending: false })
    linkedRaw = (pp ?? []) as any[]
  }

  const profileIds = new Set<string>()
  for (const slot of ['active_coordinator_id', 'active_lawyer_id', 'active_developer_id']) {
    const v = proj?.[slot]
    if (v) profileIds.add(v)
  }
  for (const lp of linkedRaw) if (lp.provider_id) profileIds.add(lp.provider_id)

  const profileById = new Map<string, any>()
  if (profileIds.size) {
    const { data: profs } = await db
      .from('sc_profiles')
      .select('id, full_name, email, provider_type')
      .in('id', Array.from(profileIds))
    for (const p of (profs ?? []) as any[]) profileById.set(p.id, p)
  }

  const roleRef = (pid: string | null | undefined): GodRoleRef | null => {
    if (!pid) return null
    const p = profileById.get(pid)
    return { id: pid, full_name: p?.full_name ?? null, email: p?.email ?? null }
  }

  const linked_providers: GodLinkedProvider[] = linkedRaw.map(lp => {
    const p = profileById.get(lp.provider_id)
    return {
      provider_id: lp.provider_id,
      full_name: p?.full_name ?? null,
      email: p?.email ?? null,
      provider_type: p?.provider_type ?? null,
      role_in_project: lp.role_in_project ?? null,
      added_at: lp.added_at ?? null,
    }
  })

  // Tenants of the building: join sc_tenant_profiles → sc_profiles.
  const { data: tps } = await db
    .from('sc_tenant_profiles')
    .select(
      'id, apartment_number, ownership_percentage, is_organizer, is_committee_member, is_committee_chair',
    )
    .eq('building_id', id)
  const tenantRows = (tps ?? []) as any[]
  const tenantIds = tenantRows.map(t => t.id).filter(Boolean)
  const tenantProfileById = new Map<string, any>()
  if (tenantIds.length) {
    const { data: tprofs } = await db
      .from('sc_profiles')
      .select('id, full_name, email, phone')
      .in('id', tenantIds)
    for (const p of (tprofs ?? []) as any[]) tenantProfileById.set(p.id, p)
  }
  const tenants: GodBuildingTenant[] = tenantRows.map(t => {
    const p = tenantProfileById.get(t.id)
    return {
      id: t.id,
      full_name: p?.full_name ?? null,
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      apartment_number: t.apartment_number ?? null,
      ownership_percentage: t.ownership_percentage ?? null,
      is_organizer: !!t.is_organizer,
      is_committee_member: !!t.is_committee_member,
      is_committee_chair: !!t.is_committee_chair,
    }
  })

  return {
    id: b.id,
    city: b.city ?? null,
    street: b.street ?? null,
    building_number: b.building_number ?? null,
    address: addressOf(b),
    project: proj
      ? {
          id: proj.id,
          name: proj.name ?? null,
          current_stage: proj.current_stage ?? null,
          target_quarter: proj.target_quarter ?? null,
          active_coordinator: roleRef(proj.active_coordinator_id),
          active_lawyer: roleRef(proj.active_lawyer_id),
          active_developer: roleRef(proj.active_developer_id),
        }
      : null,
    linked_providers,
    tenants,
  }
}

// Provider picker for reassignRole — sc_profiles with role='provider'.
export async function listProviders(db: SupabaseClient): Promise<GodProviderOption[]> {
  const { data, error } = await db
    .from('sc_profiles')
    .select('id, full_name, email, provider_type')
    .eq('role', 'provider')
    .order('full_name', { ascending: true })
    .limit(1000)
  if (error) throw new Error(error.message)
  return ((data ?? []) as any[]).map(p => ({
    id: p.id,
    full_name: p.full_name ?? null,
    email: p.email ?? null,
    provider_type: p.provider_type ?? null,
  }))
}

// ── Writes ───────────────────────────────────────────────────────────────────
export async function editBuilding(db: SupabaseClient, input: GodEditBuildingInput) {
  const patch: Record<string, string> = {}
  if (input.city !== undefined) patch.city = input.city
  if (input.street !== undefined) patch.street = input.street
  if (input.building_number !== undefined) patch.building_number = input.building_number

  const { data, error } = await db
    .from('sc_buildings')
    .update(patch)
    .eq('id', input.id)
    .select('id, city, street, building_number')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return data
}

export async function forceProjectStage(db: SupabaseClient, input: GodForceProjectStageInput) {
  const { data, error } = await db
    .from('sc_projects')
    .update({ current_stage: input.stage })
    .eq('id', input.project_id)
    .select('id, current_stage')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return data
}

export async function reassignRole(db: SupabaseClient, input: GodReassignRoleInput) {
  const column = SLOT_COLUMN[input.slot]
  const { data, error } = await db
    .from('sc_projects')
    .update({ [column]: input.provider_id })
    .eq('id', input.project_id)
    .select(`id, ${column}`)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return data
}

// Hard delete. Returns the deleted row's address for the audit meta. Throws the
// raw PostgrestError on FK restrict so the router can translate code 23503.
export async function deleteBuilding(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from('sc_buildings')
    .delete()
    .eq('id', id)
    .select('id, city, street, building_number')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return data
}

// Re-read the live building address — used by deleteBuilding to verify the
// typed confirmation string matches reality before destroying anything.
export async function getBuildingAddress(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  return { ...(data as any), address: addressOf(data as any) }
}
