// Customer Progress Center — admin types for per-user / per-building progress
// across the 14 stages + stuck detection. Backs apps/api/src/routers/god/
// progress.ts and the progress UI in the god detail modals.
import { z } from 'zod'
import type { ProjectStageId } from '../schemas/godBuildings'

// "Stuck" = an open task with no movement for this many days (or past due).
export const STUCK_DAYS = 7

export type ProgressStageStatus = 'done' | 'current' | 'upcoming'

// One task in a progress view (a sc_project_tasks row, flattened).
export interface ProgressTask {
  id: string
  stage_id: ProjectStageId | null
  title: string | null
  owner_role: string | null
  owner_user_id: string | null
  owner_name: string | null
  status: string | null
  required: boolean
  requires_doc: boolean
  due_at: string | null
  completed_at: string | null
  created_at: string | null
  stuck: boolean       // open + (older than STUCK_DAYS or past due)
  days_open: number | null
}

// One of the 14 stages with its building-level status + task tallies.
export interface ProgressStage {
  id: ProjectStageId
  label: string
  status: ProgressStageStatus
  tasksDone: number
  tasksTotal: number
  stuckCount: number
}

export interface ProgressRoleRef {
  id: string
  full_name: string | null
  email: string | null
  role: string          // human role label, e.g. 'יזם' / 'יו״ר נציגות'
}

// A single user's standing: their building's stage map + THEIR tasks.
export interface UserProgress {
  user: {
    id: string
    full_name: string | null
    email: string | null
    phone: string | null
    role: string | null            // tenant | provider
    role_label: string | null      // resolved Hebrew (יו״ר / יזם / עו״ד …)
    provider_type: string | null
  }
  has_project: boolean
  building_id: string | null
  building_address: string | null
  project_id: string | null
  current_stage: ProjectStageId | null
  current_stage_label: string | null
  days_at_stage: number | null
  stages: ProgressStage[]          // 14, building-level status
  tasks: ProgressTask[]            // THIS user's tasks (across all stages)
  totals: { done: number; total: number; stuck: number; open: number }
}

// A building/project's standing: stage map + baton holder + tallies.
export interface BuildingProgress {
  building_id: string
  building_address: string | null
  project_id: string | null
  project_name: string | null
  current_stage: ProjectStageId | null
  current_stage_label: string | null
  days_at_stage: number | null
  baton: ProgressRoleRef | null
  stages: ProgressStage[]
  totals: { done: number; total: number; stuck: number; open: number }
}

// One stuck task surfaced in the proactive overview.
export interface StuckItem {
  task_id: string
  title: string | null
  stage_id: ProjectStageId | null
  stage_label: string | null
  status: string | null
  project_id: string | null
  building_id: string | null
  building_address: string | null
  owner_user_id: string | null
  owner_name: string | null
  owner_role: string | null
  owner_role_label: string | null
  due_at: string | null
  created_at: string | null
  days: number
}

export interface StuckOverview {
  days: number
  count: number
  items: StuckItem[]
  byUser: { user_id: string; name: string | null; role_label: string | null; count: number; max_days: number }[]
  byBuilding: { building_id: string; address: string | null; count: number; max_days: number }[]
}

// ── Inputs ────────────────────────────────────────────────────────────────
export const GodUserProgressInput = z.object({ user_id: z.string().uuid() })
export type GodUserProgressInput = z.infer<typeof GodUserProgressInput>

export const GodBuildingProgressInput = z.object({ building_id: z.string().uuid() })
export type GodBuildingProgressInput = z.infer<typeof GodBuildingProgressInput>

export const GodStuckOverviewInput = z.object({
  days: z.number().int().min(1).max(120).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
})
export type GodStuckOverviewInput = z.infer<typeof GodStuckOverviewInput>
