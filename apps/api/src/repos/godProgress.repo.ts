import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PROJECT_STAGE_IDS,
  PROJECT_STAGE_LABEL,
  type ProjectStageId,
  type ProgressStage,
  type ProgressStageStatus,
  type ProgressTask,
  type ProgressRoleRef,
  type UserProgress,
  type BuildingProgress,
  type StuckItem,
  type StuckOverview,
  STUCK_DAYS,
} from '@asset-rise/shared'

// Customer Progress Center repo (read-only; service-role). Computes per-user /
// per-building standing across the 14 stages + stuck detection from the live
// workflow tables (sc_projects / sc_project_tasks) + sc_audit_log for stage
// dwell time. No writes here.

const OPEN_STATUSES = ['pending', 'open', 'in_progress', 'awaiting_approval', 'blocked']
const DEVELOPER_OWNED: ProjectStageId[] = [
  'SECOND_APPRAISAL',
  'DEADLINES_REVIEW',
  'PERMITS',
  'EVACUATION',
  'CONSTRUCTION',
  'DELIVERY',
]

function daysSince(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000))
}

function addressOf(
  b:
    | { street?: string | null; building_number?: string | null; city?: string | null }
    | null
    | undefined,
): string | null {
  if (!b) return null
  const line = [b.street, b.building_number].filter(Boolean).join(' ')
  return [line, b.city].filter(Boolean).join(', ').trim() || null
}

// Hebrew label for a role / provider_type / vaad position.
const PROVIDER_LABEL: Record<string, string> = {
  developer: 'יזם',
  lawyer: 'עו״ד',
  architect: 'אדריכל',
  appraiser: 'שמאי',
  contractor: 'קבלן',
  coordinator: 'גורם מארגן',
  generic: 'נותן שירות',
}
function roleLabelFor(p: {
  role?: string | null
  provider_type?: string | null
  is_committee_chair?: boolean
  is_committee_member?: boolean
  is_organizer?: boolean
}): string {
  if (p.role === 'provider') return PROVIDER_LABEL[p.provider_type ?? 'generic'] ?? 'נותן שירות'
  if (p.is_committee_chair) return 'יו״ר נציגות'
  if (p.is_organizer) return 'גורם מארגן (דייר)'
  if (p.is_committee_member) return 'חבר ועד'
  return 'דייר'
}

// The owner_role values a given user's tasks can carry (for unassigned,
// role-targeted tasks). Assigned tasks match by owner_user_id directly.
function ownerRolesFor(p: {
  role?: string | null
  provider_type?: string | null
  is_committee_chair?: boolean
  is_committee_member?: boolean
  is_organizer?: boolean
}): Set<string> {
  const s = new Set<string>()
  if (p.role === 'provider') {
    if (p.provider_type) s.add(p.provider_type)
  } else {
    s.add('tenant.any')
    if (p.is_organizer) s.add('tenant.organizer')
    if (p.is_committee_member) s.add('tenant.committee')
    if (p.is_committee_chair) s.add('tenant.chair')
  }
  return s
}

function isStuck(
  t: {
    status: string | null
    completed_at: string | null
    created_at: string | null
    updated_at: string | null
    due_at: string | null
  },
  nowMs: number,
  days: number,
): boolean {
  if (!t.status || !OPEN_STATUSES.includes(t.status)) return false
  if (t.completed_at) return false
  if (t.due_at && Date.parse(t.due_at) < nowMs) return true
  const moved = t.updated_at ?? t.created_at
  const d = daysSince(moved, nowMs)
  return d != null && d >= days
}

function buildStages(
  taskRows: any[],
  currentStage: string | null,
  completedStages: string[],
  nowMs: number,
): ProgressStage[] {
  const completed = new Set(completedStages)
  return PROJECT_STAGE_IDS.map((id): ProgressStage => {
    const tasks = taskRows.filter(t => t.stage_id === id)
    const done = tasks.filter(t => t.status === 'done' || t.status === 'skipped').length
    const stuck = tasks.filter(t => isStuck(t, nowMs, STUCK_DAYS)).length
    const status: ProgressStageStatus = completed.has(id)
      ? 'done'
      : id === currentStage
        ? 'current'
        : 'upcoming'
    return {
      id,
      label: PROJECT_STAGE_LABEL[id],
      status,
      tasksDone: done,
      tasksTotal: tasks.length,
      stuckCount: stuck,
    }
  })
}

async function lastStageEventDays(
  db: SupabaseClient,
  projectId: string,
  projectCreatedAt: string | null,
  nowMs: number,
): Promise<number | null> {
  const { data } = await db
    .from('sc_audit_log')
    .select('created_at')
    .eq('project_id', projectId)
    .like('action', 'project.stage.%')
    .order('created_at', { ascending: false })
    .limit(1)
  const last = (data?.[0]?.created_at as string | undefined) ?? projectCreatedAt ?? null
  return daysSince(last, nowMs)
}

async function resolveProfiles(db: SupabaseClient, ids: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>()
  if (!ids.length) return map
  const { data } = await db
    .from('sc_profiles')
    .select('id, full_name, email, role, provider_type')
    .in('id', ids)
  for (const p of (data ?? []) as any[]) map.set(p.id, p)
  return map
}

const TASK_COLS =
  'id, project_id, stage_id, title, owner_role, owner_user_id, status, required, requires_doc, due_at, completed_at, created_at, updated_at'

function toProgressTask(t: any, ownerName: string | null, nowMs: number): ProgressTask {
  return {
    id: t.id,
    stage_id: (t.stage_id ?? null) as ProjectStageId | null,
    title: t.title ?? null,
    owner_role: t.owner_role ?? null,
    owner_user_id: t.owner_user_id ?? null,
    owner_name: ownerName,
    status: t.status ?? null,
    required: !!t.required,
    requires_doc: !!t.requires_doc,
    due_at: t.due_at ?? null,
    completed_at: t.completed_at ?? null,
    created_at: t.created_at ?? null,
    stuck: isStuck(t, nowMs, STUCK_DAYS),
    days_open: t.completed_at ? null : daysSince(t.updated_at ?? t.created_at, nowMs),
  }
}

// ── Per-user progress ──────────────────────────────────────────────────────
export async function getUserProgress(db: SupabaseClient, userId: string): Promise<UserProgress> {
  const nowMs = Date.now()
  const { data: prof } = await db
    .from('sc_profiles')
    .select('id, full_name, email, phone, role, provider_type')
    .eq('id', userId)
    .maybeSingle()
  const base = {
    id: userId,
    full_name: prof?.full_name ?? null,
    email: prof?.email ?? null,
    phone: prof?.phone ?? null,
    role: prof?.role ?? null,
    provider_type: prof?.provider_type ?? null,
  }

  // Resolve the user's building/project + (for tenants) their vaad position.
  let buildingId: string | null = null
  let vaad = { is_organizer: false, is_committee_member: false, is_committee_chair: false }
  let projectId: string | null = null

  if (prof?.role === 'provider') {
    const { data: pp } = await db
      .from('sc_project_providers')
      .select('project_id, added_at')
      .eq('provider_id', userId)
      .order('added_at', { ascending: false })
      .limit(1)
    projectId = (pp?.[0]?.project_id as string | undefined) ?? null
  } else {
    const { data: tp } = await db
      .from('sc_tenant_profiles')
      .select('building_id, is_organizer, is_committee_member, is_committee_chair')
      .eq('id', userId)
      .maybeSingle()
    buildingId = (tp?.building_id as string | undefined) ?? null
    vaad = {
      is_organizer: !!tp?.is_organizer,
      is_committee_member: !!tp?.is_committee_member,
      is_committee_chair: !!tp?.is_committee_chair,
    }
  }

  const roleLabel = roleLabelFor({ ...base, ...vaad })
  const roleSet = ownerRolesFor({ ...base, ...vaad })

  // Resolve the project row (by id for providers, by building for tenants).
  let proj: any = null
  if (projectId) {
    const { data } = await db
      .from('sc_projects')
      .select('id, name, building_id, current_stage, completed_stages, created_at')
      .eq('id', projectId)
      .maybeSingle()
    proj = data
    buildingId = proj?.building_id ?? buildingId
  } else if (buildingId) {
    const { data } = await db
      .from('sc_projects')
      .select('id, name, building_id, current_stage, completed_stages, created_at')
      .eq('building_id', buildingId)
      .order('created_at', { ascending: false })
      .limit(1)
    proj = data?.[0] ?? null
    projectId = proj?.id ?? null
  }

  const empty: UserProgress = {
    user: { ...base, role_label: roleLabel },
    has_project: false,
    building_id: buildingId,
    building_address: null,
    project_id: null,
    current_stage: null,
    current_stage_label: null,
    days_at_stage: null,
    stages: [],
    tasks: [],
    totals: { done: 0, total: 0, stuck: 0, open: 0 },
  }
  if (!proj || !projectId) {
    if (buildingId) {
      const { data: b } = await db
        .from('sc_buildings')
        .select('city, street, building_number')
        .eq('id', buildingId)
        .maybeSingle()
      empty.building_address = addressOf(b)
    }
    return empty
  }

  const [{ data: bRow }, { data: taskRows }, daysAtStage] = await Promise.all([
    db
      .from('sc_buildings')
      .select('city, street, building_number')
      .eq('id', proj.building_id)
      .maybeSingle(),
    db
      .from('sc_project_tasks')
      .select(TASK_COLS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
    lastStageEventDays(db, projectId, proj.created_at ?? null, nowMs),
  ])
  const allTasks = (taskRows ?? []) as any[]
  const completed = (proj.completed_stages ?? []) as string[]
  const stages = buildStages(allTasks, proj.current_stage ?? null, completed, nowMs)

  // This user's tasks: assigned to them, OR unassigned + targeted at their role.
  const mine = allTasks.filter(
    t =>
      t.owner_user_id === userId || (!t.owner_user_id && t.owner_role && roleSet.has(t.owner_role)),
  )
  const tasks = mine.map(t => toProgressTask(t, base.full_name, nowMs))
  const done = tasks.filter(t => t.status === 'done' || t.status === 'skipped').length
  const stuck = tasks.filter(t => t.stuck).length
  const open = tasks.filter(t => t.status && OPEN_STATUSES.includes(t.status)).length
  const curStage = (proj.current_stage ?? null) as ProjectStageId | null

  return {
    user: { ...base, role_label: roleLabel },
    has_project: true,
    building_id: proj.building_id ?? null,
    building_address: addressOf(bRow),
    project_id: projectId,
    current_stage: curStage,
    current_stage_label: curStage ? PROJECT_STAGE_LABEL[curStage] : null,
    days_at_stage: daysAtStage,
    stages,
    tasks,
    totals: { done, total: tasks.length, stuck, open },
  }
}

// ── Per-building progress ───────────────────────────────────────────────────
export async function getBuildingProgress(
  db: SupabaseClient,
  buildingId: string,
): Promise<BuildingProgress> {
  const nowMs = Date.now()
  const { data: b } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .eq('id', buildingId)
    .maybeSingle()
  const { data: pData } = await db
    .from('sc_projects')
    .select(
      'id, name, building_id, current_stage, completed_stages, created_at, active_coordinator_id, active_developer_id',
    )
    .eq('building_id', buildingId)
    .order('created_at', { ascending: false })
    .limit(1)
  const proj = pData?.[0] ?? null

  const baseEmpty: BuildingProgress = {
    building_id: buildingId,
    building_address: addressOf(b),
    project_id: null,
    project_name: null,
    current_stage: null,
    current_stage_label: null,
    days_at_stage: null,
    baton: null,
    stages: [],
    totals: { done: 0, total: 0, stuck: 0, open: 0 },
  }
  if (!proj) return baseEmpty

  const [{ data: taskRows }, daysAtStage] = await Promise.all([
    db
      .from('sc_project_tasks')
      .select(TASK_COLS)
      .eq('project_id', proj.id)
      .order('created_at', { ascending: true }),
    lastStageEventDays(db, proj.id, proj.created_at ?? null, nowMs),
  ])
  const allTasks = (taskRows ?? []) as any[]
  const completed = (proj.completed_stages ?? []) as string[]
  const curStage = (proj.current_stage ?? null) as ProjectStageId | null
  const stages = buildStages(allTasks, curStage, completed, nowMs)

  // Baton holder: developer for developer-owned stages, else coordinator, else chair.
  let baton: ProgressRoleRef | null = null
  const devOwned = curStage ? DEVELOPER_OWNED.includes(curStage) : false
  if (devOwned && proj.active_developer_id) {
    const m = await resolveProfiles(db, [proj.active_developer_id])
    const p = m.get(proj.active_developer_id)
    baton = {
      id: proj.active_developer_id,
      full_name: p?.full_name ?? null,
      email: p?.email ?? null,
      role: 'יזם',
    }
  } else if (proj.active_coordinator_id) {
    const m = await resolveProfiles(db, [proj.active_coordinator_id])
    const p = m.get(proj.active_coordinator_id)
    baton = {
      id: proj.active_coordinator_id,
      full_name: p?.full_name ?? null,
      email: p?.email ?? null,
      role: 'גורם מארגן',
    }
  } else {
    const { data: chair } = await db
      .from('sc_tenant_profiles')
      .select('id')
      .eq('building_id', buildingId)
      .eq('is_committee_chair', true)
      .limit(1)
    const chairId = chair?.[0]?.id as string | undefined
    if (chairId) {
      const m = await resolveProfiles(db, [chairId])
      const p = m.get(chairId)
      baton = {
        id: chairId,
        full_name: p?.full_name ?? null,
        email: p?.email ?? null,
        role: 'יו״ר נציגות',
      }
    }
  }

  const done = allTasks.filter(t => t.status === 'done' || t.status === 'skipped').length
  const stuck = allTasks.filter(t => isStuck(t, nowMs, STUCK_DAYS)).length
  const open = allTasks.filter(t => t.status && OPEN_STATUSES.includes(t.status)).length

  return {
    building_id: buildingId,
    building_address: addressOf(b),
    project_id: proj.id,
    project_name: proj.name ?? null,
    current_stage: curStage,
    current_stage_label: curStage ? PROJECT_STAGE_LABEL[curStage] : null,
    days_at_stage: daysAtStage,
    baton,
    stages,
    totals: { done, total: allTasks.length, stuck, open },
  }
}

// ── Stuck overview (proactive "who needs help") ─────────────────────────────
export async function getStuckOverview(
  db: SupabaseClient,
  days: number,
  limit: number,
): Promise<StuckOverview> {
  const nowMs = Date.now()
  // Pull open tasks (bounded) and filter to stuck in memory (the OR over
  // due_at/age isn't a single PostgREST predicate).
  const { data: taskRows } = await db
    .from('sc_project_tasks')
    .select(TASK_COLS)
    .in('status', OPEN_STATUSES)
    .is('completed_at', null)
    .order('created_at', { ascending: true })
    .limit(2000)
  const open = (taskRows ?? []) as any[]
  const stuckRows = open.filter(t => isStuck(t, nowMs, days))

  // Resolve projects → buildings + addresses, and owner names.
  const projectIds = Array.from(new Set(stuckRows.map(t => t.project_id).filter(Boolean)))
  const ownerIds = Array.from(new Set(stuckRows.map(t => t.owner_user_id).filter(Boolean)))
  const projById = new Map<string, any>()
  if (projectIds.length) {
    const { data } = await db.from('sc_projects').select('id, building_id').in('id', projectIds)
    for (const p of (data ?? []) as any[]) projById.set(p.id, p)
  }
  const buildingIds = Array.from(
    new Set([...projById.values()].map(p => p.building_id).filter(Boolean)),
  )
  const bById = new Map<string, any>()
  if (buildingIds.length) {
    const { data } = await db
      .from('sc_buildings')
      .select('id, city, street, building_number')
      .in('id', buildingIds)
    for (const b of (data ?? []) as any[]) bById.set(b.id, b)
  }
  const profById = await resolveProfiles(db, ownerIds)

  const items: StuckItem[] = stuckRows
    .map(t => {
      const proj = t.project_id ? projById.get(t.project_id) : null
      const bid = proj?.building_id ?? null
      const moved = t.updated_at ?? t.created_at
      const dueOver = t.due_at && Date.parse(t.due_at) < nowMs ? daysSince(t.due_at, nowMs) : null
      const days = Math.max(daysSince(moved, nowMs) ?? 0, dueOver ?? 0)
      return {
        task_id: t.id,
        title: t.title ?? null,
        stage_id: (t.stage_id ?? null) as ProjectStageId | null,
        stage_label: t.stage_id
          ? (PROJECT_STAGE_LABEL[t.stage_id as ProjectStageId] ?? null)
          : null,
        status: t.status ?? null,
        project_id: t.project_id ?? null,
        building_id: bid,
        building_address: addressOf(bid ? bById.get(bid) : null),
        owner_user_id: t.owner_user_id ?? null,
        owner_name: t.owner_user_id ? (profById.get(t.owner_user_id)?.full_name ?? null) : null,
        owner_role: t.owner_role ?? null,
        owner_role_label: t.owner_user_id
          ? roleLabelFor(profById.get(t.owner_user_id) ?? {})
          : (t.owner_role ?? null),
        due_at: t.due_at ?? null,
        created_at: t.created_at ?? null,
        days,
      }
    })
    .sort((a, b) => b.days - a.days)
    .slice(0, limit)

  // Groupings.
  const byUserMap = new Map<
    string,
    { name: string | null; role_label: string | null; count: number; max_days: number }
  >()
  const byBuildingMap = new Map<
    string,
    { address: string | null; count: number; max_days: number }
  >()
  for (const it of items) {
    if (it.owner_user_id) {
      const e = byUserMap.get(it.owner_user_id) ?? {
        name: it.owner_name,
        role_label: it.owner_role_label,
        count: 0,
        max_days: 0,
      }
      e.count++
      e.max_days = Math.max(e.max_days, it.days)
      byUserMap.set(it.owner_user_id, e)
    }
    if (it.building_id) {
      const e = byBuildingMap.get(it.building_id) ?? {
        address: it.building_address,
        count: 0,
        max_days: 0,
      }
      e.count++
      e.max_days = Math.max(e.max_days, it.days)
      byBuildingMap.set(it.building_id, e)
    }
  }

  return {
    days,
    count: items.length,
    items,
    byUser: [...byUserMap.entries()]
      .map(([user_id, v]) => ({ user_id, ...v }))
      .sort((a, b) => b.count - a.count),
    byBuilding: [...byBuildingMap.entries()]
      .map(([building_id, v]) => ({ building_id, ...v }))
      .sort((a, b) => b.count - a.count),
  }
}
