import { z } from 'zod'

// ── God-mode: Workflow / Baton / Dual-approval (Wave 2 — "workflow") ─────────
// Zod inputs + response shapes for the super-admin workflow domain. Backend
// gating is requireLevel('admin.super') (direct roleKey membership; see
// lib/god.ts); these schemas only validate payloads. Isolated from the other
// god schema files on purpose — the integration step re-exports this from
// packages/shared/src/index.ts.
//
// Domain model (silver-castle sc_*; service-role can read/write all):
//   sc_project_tasks(id, project_id, stage_id, slug, title, required,
//     owner_role, owner_user_id, status, due_at, completed_at, completed_by, …)
//   sc_building_tasks(id, building_id, project_id, kind, title, assigned_role,
//     assigned_to, status, priority, done_at, done_by, …)
//   sc_dual_approvals(id, project_id, action, primary_user_id, approver_user_id,
//     status, primary_signed_at, approver_signed_at, reason, …)
//   Baton = sc_projects.active_coordinator_id / active_lawyer_id /
//     active_developer_id (FK sc_profiles, ON DELETE SET NULL).
//
// IMPORTANT — these are god overrides. Forcing a task status, reassigning an
// owner, setting a baton holder, or resolving a stuck dual-approval all write
// the rows DIRECTLY via service-role, BYPASSING the normal workflow engine
// (dependency gates, dual-sign requirements, stage-template re-derivation). No
// hard deletes here. Every write is audited via godMutation; the destructive /
// flow-overriding ones (force a task to done/skipped, force-resolve a stuck
// dual-approval) are gated behind a DangerConfirm in the UI.

// ── Project-task status (sc_project_tasks.status CHECK) ──────────────────────
// MUST stay in lockstep with the sc_project_tasks status CHECK constraint in
// silver-castle (migration 038). The god surface can force ANY of these.
export const PROJECT_TASK_STATUSES = [
  'pending',
  'open',
  'in_progress',
  'awaiting_approval',
  'done',
  'skipped',
  'blocked',
] as const
export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUSES)[number]

export const PROJECT_TASK_STATUS_LABEL: Record<ProjectTaskStatus, string> = {
  pending: 'ממתין',
  open: 'פתוח',
  in_progress: 'בתהליך',
  awaiting_approval: 'ממתין לאישור',
  done: 'הושלם',
  skipped: 'דולג',
  blocked: 'חסום',
}

export const ProjectTaskStatusEnum = z.enum(PROJECT_TASK_STATUSES)

// Statuses that the UI treats as flow-overriding / terminal and therefore gates
// behind a DangerConfirm (forcing a task complete or skipping it past its gates).
export const PROJECT_TASK_DANGER_STATUSES: ProjectTaskStatus[] = ['done', 'skipped']

// ── Building-task status (sc_building_tasks.status CHECK) ────────────────────
// MUST stay in lockstep with the sc_building_tasks status CHECK (migration 019).
export const BUILDING_TASK_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const
export type BuildingTaskStatus = (typeof BUILDING_TASK_STATUSES)[number]

export const BUILDING_TASK_STATUS_LABEL: Record<BuildingTaskStatus, string> = {
  open: 'פתוח',
  in_progress: 'בתהליך',
  done: 'הושלם',
  cancelled: 'בוטל',
}

export const BuildingTaskStatusEnum = z.enum(BUILDING_TASK_STATUSES)

export const BUILDING_TASK_DANGER_STATUSES: BuildingTaskStatus[] = ['done', 'cancelled']

// ── Dual-approval status (sc_dual_approvals.status CHECK) ────────────────────
export const DUAL_APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const
export type DualApprovalStatus = (typeof DUAL_APPROVAL_STATUSES)[number]

export const DUAL_APPROVAL_STATUS_LABEL: Record<DualApprovalStatus, string> = {
  pending: 'ממתין',
  approved: 'אושר',
  rejected: 'נדחה',
  expired: 'פג תוקף',
}

// resolveDualApproval can only FORCE a terminal decision — approved or rejected.
// (Re-opening to pending / expiring is intentionally not exposed.)
export const DUAL_APPROVAL_RESOLUTIONS = ['approved', 'rejected'] as const
export type DualApprovalResolution = (typeof DUAL_APPROVAL_RESOLUTIONS)[number]
export const DualApprovalResolutionEnum = z.enum(DUAL_APPROVAL_RESOLUTIONS)

// ── Baton slots → sc_projects.active_*_id columns ────────────────────────────
export const BATON_SLOTS = ['coordinator', 'lawyer', 'developer'] as const
export type BatonSlot = (typeof BATON_SLOTS)[number]
export const BatonSlotEnum = z.enum(BATON_SLOTS)

export const BATON_SLOT_LABEL: Record<BatonSlot, string> = {
  coordinator: 'גורם מלווה',
  lawyer: 'עו״ד',
  developer: 'יזם',
}

// Which task family a setTaskStatus / reassignTask write targets.
export const TASK_KINDS = ['project', 'building'] as const
export type TaskKind = (typeof TASK_KINDS)[number]
export const TaskKindEnum = z.enum(TASK_KINDS)

// ── Project picker (the page is per a chosen project) ────────────────────────
export const GodWorkflowProjectListInput = z.object({
  q: z.string().max(160).optional(),
  limit: z.number().int().min(1).max(500).default(300),
})
export type GodWorkflowProjectListInput = z.infer<typeof GodWorkflowProjectListInput>

export interface GodWorkflowProjectOption {
  id: string
  name: string | null
  building_id: string | null
  building_address: string | null
  current_stage: string | null
}

// ── Detail (everything for one project) ──────────────────────────────────────
export const GodWorkflowGetInput = z.object({ project_id: z.string().uuid() })
export type GodWorkflowGetInput = z.infer<typeof GodWorkflowGetInput>

export interface GodWorkflowRoleRef {
  id: string
  full_name: string | null
  email: string | null
}

export interface GodWorkflowProjectTask {
  id: string
  stage_id: string | null
  slug: string | null
  title: string | null
  required: boolean
  owner_role: string | null
  owner_user_id: string | null
  owner_name: string | null
  owner_email: string | null
  status: ProjectTaskStatus | string | null
  due_at: string | null
  completed_at: string | null
  created_at: string | null
}

export interface GodWorkflowBuildingTask {
  id: string
  kind: string | null
  title: string | null
  assigned_role: string | null
  assigned_to: string | null
  assignee_name: string | null
  assignee_email: string | null
  status: BuildingTaskStatus | string | null
  priority: string | null
  done_at: string | null
  created_at: string | null
}

export interface GodWorkflowDualApproval {
  id: string
  action: string | null
  status: DualApprovalStatus | string | null
  primary_user_id: string | null
  primary_name: string | null
  approver_user_id: string | null
  approver_name: string | null
  primary_signed_at: string | null
  approver_signed_at: string | null
  reason: string | null
  created_at: string | null
  expires_at: string | null
}

export interface GodWorkflowDetail {
  project_id: string
  project_name: string | null
  building_id: string | null
  building_address: string | null
  current_stage: string | null
  // Baton holders (sc_projects.active_*_id), resolved to profile refs.
  active_coordinator: GodWorkflowRoleRef | null
  active_lawyer: GodWorkflowRoleRef | null
  active_developer: GodWorkflowRoleRef | null
  project_tasks: GodWorkflowProjectTask[]
  building_tasks: GodWorkflowBuildingTask[]
  dual_approvals: GodWorkflowDualApproval[]
}

// Profile picker for the reassign / setBaton dropdowns (any sc_profiles row).
export const GodWorkflowProfileSearchInput = z.object({
  q: z.string().max(160).optional(),
  limit: z.number().int().min(1).max(200).default(50),
})
export type GodWorkflowProfileSearchInput = z.infer<typeof GodWorkflowProfileSearchInput>

export interface GodWorkflowProfileOption {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  provider_type: string | null
}

// ── Writes ────────────────────────────────────────────────────────────────────
// setTaskStatus — force a project OR building task to a new status. The accepted
// status set differs per family (the CHECK constraints differ), so the input
// carries the kind + a free string status validated against the right enum at
// the router. Forcing done/skipped (project) or done/cancelled (building) is the
// flow-overriding case the UI gates behind a DangerConfirm.
export const GodSetTaskStatusInput = z.object({
  kind: TaskKindEnum,
  task_id: z.string().uuid(),
  status: z.string().trim().min(1).max(40),
})
export type GodSetTaskStatusInput = z.infer<typeof GodSetTaskStatusInput>

// reassignTask — set the owner of a project task (owner_user_id) or a building
// task (assigned_to). A null user clears the owner. Both columns are FK
// sc_profiles ON DELETE SET NULL, so a bad id trips an FK violation that the
// router translates to a Hebrew message.
export const GodReassignTaskInput = z.object({
  kind: TaskKindEnum,
  task_id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
})
export type GodReassignTaskInput = z.infer<typeof GodReassignTaskInput>

// setBaton — set sc_projects.active_<slot>_id to a profile (or null to clear).
export const GodSetBatonInput = z.object({
  project_id: z.string().uuid(),
  slot: BatonSlotEnum,
  user_id: z.string().uuid().nullable(),
})
export type GodSetBatonInput = z.infer<typeof GodSetBatonInput>

// resolveDualApproval — force a stuck sc_dual_approvals to approved / rejected,
// BYPASSING the two-party sign. `confirm` carries the typed action label from
// the DangerConfirm interlock (non-empty token guard). `reason` is recorded on
// the row + in the audit meta.
export const GodResolveDualApprovalInput = z.object({
  id: z.string().uuid(),
  resolution: DualApprovalResolutionEnum,
  reason: z.string().max(400).optional(),
  confirm: z.string().min(1).max(400),
})
export type GodResolveDualApprovalInput = z.infer<typeof GodResolveDualApprovalInput>
