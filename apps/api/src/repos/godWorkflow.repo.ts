import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GodWorkflowProjectListInput,
  GodWorkflowProjectOption,
  GodWorkflowProfileSearchInput,
  GodWorkflowProfileOption,
  GodWorkflowDetail,
  GodWorkflowRoleRef,
  GodWorkflowProjectTask,
  GodWorkflowBuildingTask,
  GodWorkflowDualApproval,
  GodSetTaskStatusInput,
  GodReassignTaskInput,
  GodSetBatonInput,
  GodResolveDualApprovalInput,
  BatonSlot,
} from '@asset-rise/shared/schemas/godWorkflow'

// God-mode "Workflow / Baton / Dual-approval" repo (Wave 2). Runs as
// service-role (adminClient) so it reads/writes any sc_* row, bypassing RLS.
// Routers gate access; repos only do DB work. All writes are wrapped by
// godMutation() at the router layer.
//
// IMPORTANT — these are god overrides. Forcing a task status, reassigning an
// owner, setting a baton holder, or force-resolving a dual-approval all write
// the rows DIRECTLY, bypassing the normal workflow engine (dependency gates,
// dual-sign requirements, stage-template re-derivation). No hard deletes here.

// FK-violation SQLSTATE — reassigning a task / setting a baton to a user id that
// isn't a real sc_profiles row trips this; the router translates it to a
// friendly Hebrew message instead of a 500.
export const PG_FK_VIOLATION = '23503'

// Map a baton slot to its sc_projects column.
const BATON_COLUMN: Record<BatonSlot, string> = {
  coordinator: 'active_coordinator_id',
  lawyer: 'active_lawyer_id',
  developer: 'active_developer_id',
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

// PostgREST treats comma/parens specially inside .or() and % _ * are LIKE
// metacharacters — strip them so a term can't broaden into a match-everything
// dump (same hardening as the other god repos).
function sanitizeTerm(q: string): string {
  return q.replace(/[(),%_*\\]/g, ' ').trim()
}

// ── Project picker ───────────────────────────────────────────────────────────
// Lists projects + resolved building address (the workflow page is per a chosen
// project). Free-text matches the project name + resolved building address
// post-resolution.
export async function listWorkflowProjects(
  db: SupabaseClient,
  input: GodWorkflowProjectListInput,
): Promise<GodWorkflowProjectOption[]> {
  const { data, error } = await db
    .from('sc_projects')
    .select('id, name, building_id, current_stage, created_at')
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 300)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]
  if (!rows.length) return []

  const buildingById = await resolveBuildings(
    db,
    Array.from(new Set(rows.map(r => r.building_id).filter(Boolean) as string[])),
  )

  let items: GodWorkflowProjectOption[] = rows.map(r => ({
    id: r.id,
    name: r.name ?? null,
    building_id: r.building_id ?? null,
    building_address: addressOf(buildingById.get(r.building_id) ?? null),
    current_stage: r.current_stage ?? null,
  }))

  const safe = input.q ? sanitizeTerm(input.q).toLowerCase() : ''
  if (safe) {
    items = items.filter(i =>
      [i.name, i.building_address].filter(Boolean).join(' ').toLowerCase().includes(safe),
    )
  }
  return items
}

// ── Profile picker (reassign / setBaton dropdowns) ───────────────────────────
export async function searchWorkflowProfiles(
  db: SupabaseClient,
  input: GodWorkflowProfileSearchInput,
): Promise<GodWorkflowProfileOption[]> {
  let q = db
    .from('sc_profiles')
    .select('id, full_name, email, role, provider_type')
    .order('full_name', { ascending: true })
    .limit(input.limit ?? 50)

  const safe = input.q ? sanitizeTerm(input.q) : ''
  if (safe) {
    // Match the typed term against the name or email.
    q = q.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
  }

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return ((data ?? []) as any[]).map(p => ({
    id: p.id,
    full_name: p.full_name ?? null,
    email: p.email ?? null,
    role: p.role ?? null,
    provider_type: p.provider_type ?? null,
  }))
}

// ── Detail (everything for one project) ──────────────────────────────────────
export async function getWorkflowDetail(
  db: SupabaseClient,
  projectId: string,
): Promise<GodWorkflowDetail | null> {
  const { data: proj, error } = await db
    .from('sc_projects')
    .select(
      'id, name, building_id, current_stage, active_coordinator_id, active_lawyer_id, active_developer_id',
    )
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!proj) return null

  // Project tasks (workflow-engine tasks).
  const { data: ptRows } = await db
    .from('sc_project_tasks')
    .select(
      'id, stage_id, slug, title, required, owner_role, owner_user_id, status, due_at, completed_at, created_at',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  const projectTaskRows = (ptRows ?? []) as any[]

  // Building tasks for this project (sc_building_tasks.project_id).
  const { data: btRows } = await db
    .from('sc_building_tasks')
    .select(
      'id, kind, title, assigned_role, assigned_to, status, priority, done_at, created_at',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
  const buildingTaskRows = (btRows ?? []) as any[]

  // Dual approvals for this project.
  const { data: daRows } = await db
    .from('sc_dual_approvals')
    .select(
      'id, action, status, primary_user_id, approver_user_id, primary_signed_at, approver_signed_at, reason, created_at, expires_at',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  const dualRows = (daRows ?? []) as any[]

  // Batch-resolve every referenced profile id (baton + task owners + approvals).
  const profileIds = new Set<string>()
  for (const slot of ['active_coordinator_id', 'active_lawyer_id', 'active_developer_id']) {
    const v = (proj as any)[slot]
    if (v) profileIds.add(v)
  }
  for (const t of projectTaskRows) if (t.owner_user_id) profileIds.add(t.owner_user_id)
  for (const t of buildingTaskRows) if (t.assigned_to) profileIds.add(t.assigned_to)
  for (const d of dualRows) {
    if (d.primary_user_id) profileIds.add(d.primary_user_id)
    if (d.approver_user_id) profileIds.add(d.approver_user_id)
  }

  const [buildingById, profileById] = await Promise.all([
    proj.building_id ? resolveBuildings(db, [proj.building_id]) : Promise.resolve(new Map()),
    resolveProfiles(db, Array.from(profileIds)),
  ])

  const roleRef = (pid: string | null | undefined): GodWorkflowRoleRef | null => {
    if (!pid) return null
    const p = profileById.get(pid)
    return { id: pid, full_name: p?.full_name ?? null, email: p?.email ?? null }
  }
  const nameOf = (pid: string | null | undefined): string | null =>
    pid ? (profileById.get(pid)?.full_name ?? null) : null
  const emailOf = (pid: string | null | undefined): string | null =>
    pid ? (profileById.get(pid)?.email ?? null) : null

  const project_tasks: GodWorkflowProjectTask[] = projectTaskRows.map(t => ({
    id: t.id,
    stage_id: t.stage_id ?? null,
    slug: t.slug ?? null,
    title: t.title ?? null,
    required: !!t.required,
    owner_role: t.owner_role ?? null,
    owner_user_id: t.owner_user_id ?? null,
    owner_name: nameOf(t.owner_user_id),
    owner_email: emailOf(t.owner_user_id),
    status: t.status ?? null,
    due_at: t.due_at ?? null,
    completed_at: t.completed_at ?? null,
    created_at: t.created_at ?? null,
  }))

  const building_tasks: GodWorkflowBuildingTask[] = buildingTaskRows.map(t => ({
    id: t.id,
    kind: t.kind ?? null,
    title: t.title ?? null,
    assigned_role: t.assigned_role ?? null,
    assigned_to: t.assigned_to ?? null,
    assignee_name: nameOf(t.assigned_to),
    assignee_email: emailOf(t.assigned_to),
    status: t.status ?? null,
    priority: t.priority ?? null,
    done_at: t.done_at ?? null,
    created_at: t.created_at ?? null,
  }))

  const dual_approvals: GodWorkflowDualApproval[] = dualRows.map(d => ({
    id: d.id,
    action: d.action ?? null,
    status: d.status ?? null,
    primary_user_id: d.primary_user_id ?? null,
    primary_name: nameOf(d.primary_user_id),
    approver_user_id: d.approver_user_id ?? null,
    approver_name: nameOf(d.approver_user_id),
    primary_signed_at: d.primary_signed_at ?? null,
    approver_signed_at: d.approver_signed_at ?? null,
    reason: d.reason ?? null,
    created_at: d.created_at ?? null,
    expires_at: d.expires_at ?? null,
  }))

  return {
    project_id: proj.id,
    project_name: proj.name ?? null,
    building_id: proj.building_id ?? null,
    building_address: addressOf(buildingById.get(proj.building_id) ?? null),
    current_stage: proj.current_stage ?? null,
    active_coordinator: roleRef(proj.active_coordinator_id),
    active_lawyer: roleRef(proj.active_lawyer_id),
    active_developer: roleRef(proj.active_developer_id),
    project_tasks,
    building_tasks,
    dual_approvals,
  }
}

// Load just enough of a task to drive a setTaskStatus / reassignTask write,
// returning its project_id (for the audit meta) + current status/title. Throws
// 'NOT_FOUND' if the task doesn't exist. Used for both families via `table`.
export async function loadTaskTarget(
  db: SupabaseClient,
  kind: GodSetTaskStatusInput['kind'],
  taskId: string,
): Promise<{ id: string; project_id: string | null; status: string | null; title: string | null }> {
  const table = kind === 'project' ? 'sc_project_tasks' : 'sc_building_tasks'
  const { data, error } = await db
    .from(table)
    .select('id, project_id, status, title')
    .eq('id', taskId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('NOT_FOUND')
  return {
    id: data.id,
    project_id: data.project_id ?? null,
    status: data.status ?? null,
    title: data.title ?? null,
  }
}

// Load a dual-approval for resolveDualApproval — returns the action label (for
// the typed-confirm interlock) + project_id + current status. Throws
// 'NOT_FOUND' if it doesn't exist.
export async function loadDualApprovalTarget(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; project_id: string | null; action: string | null; status: string | null }> {
  const { data, error } = await db
    .from('sc_dual_approvals')
    .select('id, project_id, action, status')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('NOT_FOUND')
  return {
    id: data.id,
    project_id: data.project_id ?? null,
    action: data.action ?? null,
    status: data.status ?? null,
  }
}

// ── Writes ───────────────────────────────────────────────────────────────────
// setTaskStatus — force a project/building task to a new status. The completion
// bookkeeping columns (completed_at/done_at) are set so the forced row matches
// what the normal flow would write; the project-task `updated_at` trigger keeps
// timestamps honest.
export async function setTaskStatus(db: SupabaseClient, input: GodSetTaskStatusInput) {
  if (input.kind === 'project') {
    const patch: Record<string, unknown> = { status: input.status }
    // Keep completed_at consistent with the forced terminal/non-terminal state.
    patch.completed_at = input.status === 'done' ? new Date().toISOString() : null
    const { data, error } = await db
      .from('sc_project_tasks')
      .update(patch)
      .eq('id', input.task_id)
      .select('id, status')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('NOT_FOUND')
    return data
  }
  // building task
  const patch: Record<string, unknown> = { status: input.status }
  patch.done_at = input.status === 'done' ? new Date().toISOString() : null
  const { data, error } = await db
    .from('sc_building_tasks')
    .update(patch)
    .eq('id', input.task_id)
    .select('id, status')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return data
}

// reassignTask — set the owner of a project task (owner_user_id) or building
// task (assigned_to). Throws the raw PostgrestError on FK violation so the
// router can translate code 23503.
export async function reassignTask(db: SupabaseClient, input: GodReassignTaskInput) {
  const table = input.kind === 'project' ? 'sc_project_tasks' : 'sc_building_tasks'
  const column = input.kind === 'project' ? 'owner_user_id' : 'assigned_to'
  const { data, error } = await db
    .from(table)
    .update({ [column]: input.user_id })
    .eq('id', input.task_id)
    .select(`id, ${column}`)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return data
}

// setBaton — set sc_projects.active_<slot>_id (or null to clear). Throws the raw
// PostgrestError on FK violation so the router can translate code 23503.
export async function setBaton(db: SupabaseClient, input: GodSetBatonInput) {
  const column = BATON_COLUMN[input.slot]
  const { data, error } = await db
    .from('sc_projects')
    .update({ [column]: input.user_id })
    .eq('id', input.project_id)
    .select(`id, ${column}`)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return data
}

// resolveDualApproval — force a stuck approval to approved/rejected, bypassing
// the two-party sign. Records the reason + stamps both sign timestamps (so the
// forced row reflects a completed decision) without requiring real signatures.
export async function resolveDualApproval(db: SupabaseClient, input: GodResolveDualApprovalInput) {
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: input.resolution,
    // Stamp both legs so the forced decision looks finalized to readers.
    primary_signed_at: now,
    approver_signed_at: now,
  }
  if (input.reason !== undefined) patch.reason = input.reason
  const { data, error } = await db
    .from('sc_dual_approvals')
    .update(patch)
    .eq('id', input.id)
    .select('id, status')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return data
}

// ── Batch resolvers ───────────────────────────────────────────────────────────
async function resolveBuildings(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { city: string | null; street: string | null; building_number: string | null }>> {
  const map = new Map<string, any>()
  if (!ids.length) return map
  const { data } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .in('id', ids)
  for (const b of (data ?? []) as any[]) map.set(b.id, b)
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
