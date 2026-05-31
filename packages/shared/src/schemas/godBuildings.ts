import { z } from 'zod'

// ── God-mode: Buildings + Projects ───────────────────────────────────────────
// Zod inputs + response shapes for the super-admin buildings domain. Backend
// gating is requireLevel('admin.super'); these schemas only validate payloads.

// Canonical 14-stage pinui-binui workflow. MUST stay in lockstep with
// silver-castle packages/shared types/project.ts ProjectStageId + the
// sc_projects.current_stage CHECK constraint (migration 041). This admin app
// does not depend on @asset-rise (silver-castle) shared, so the enum + Hebrew
// labels are mirrored here as the single source of truth for the god surface.
export const PROJECT_STAGE_IDS = [
  'REGISTRATION',
  'REP_ELECTION',
  'BATON_TO_REP',
  'SELECT_ORGANIZER',
  'SELECT_LAWYER',
  'OPEN_TENDERS',
  'APPRAISER_ARCHITECT',
  'SELECT_DEVELOPER',
  'SECOND_APPRAISAL',
  'DEADLINES_REVIEW',
  'PERMITS',
  'EVACUATION',
  'CONSTRUCTION',
  'DELIVERY',
] as const
export type ProjectStageId = (typeof PROJECT_STAGE_IDS)[number]

export const PROJECT_STAGE_LABEL: Record<ProjectStageId, string> = {
  REGISTRATION: 'רישום דיירים',
  REP_ELECTION: 'בחירת נציגות',
  BATON_TO_REP: 'העברת שרביט לנציג',
  SELECT_ORGANIZER: 'בחירת גורם מארגן',
  SELECT_LAWYER: 'בחירת עו״ד',
  OPEN_TENDERS: 'פתיחת מכרזים',
  APPRAISER_ARCHITECT: 'שמאי + אדריכל',
  SELECT_DEVELOPER: 'בחירת יזם',
  SECOND_APPRAISAL: 'שמאי שני',
  DEADLINES_REVIEW: 'לוחות זמנים',
  PERMITS: 'היתרים',
  EVACUATION: 'פינוי דיירים',
  CONSTRUCTION: 'בנייה',
  DELIVERY: 'מסירת דירות',
}

export const ProjectStageEnum = z.enum(PROJECT_STAGE_IDS)

// The three active-role slots a super-admin may reassign on a project.
export const PROJECT_ROLE_SLOTS = ['coordinator', 'lawyer', 'developer'] as const
export type ProjectRoleSlot = (typeof PROJECT_ROLE_SLOTS)[number]
export const ProjectRoleSlotEnum = z.enum(PROJECT_ROLE_SLOTS)

// ── Inputs ───────────────────────────────────────────────────────────────────
export const GodBuildingGetInput = z.object({ id: z.string().uuid() })
export type GodBuildingGetInput = z.infer<typeof GodBuildingGetInput>

// editBuilding — at least one address field must be present; each, when given,
// is a trimmed non-empty string (the underlying columns are NOT NULL).
export const GodEditBuildingInput = z
  .object({
    id: z.string().uuid(),
    city: z.string().trim().min(1).max(120).optional(),
    street: z.string().trim().min(1).max(160).optional(),
    building_number: z.string().trim().min(1).max(40).optional(),
  })
  .refine(
    v => v.city !== undefined || v.street !== undefined || v.building_number !== undefined,
    { message: 'יש לספק לפחות שדה אחד לעדכון' },
  )
export type GodEditBuildingInput = z.infer<typeof GodEditBuildingInput>

export const GodForceProjectStageInput = z.object({
  project_id: z.string().uuid(),
  stage: ProjectStageEnum,
})
export type GodForceProjectStageInput = z.infer<typeof GodForceProjectStageInput>

// reassignRole — provider_id null clears the slot.
export const GodReassignRoleInput = z.object({
  project_id: z.string().uuid(),
  slot: ProjectRoleSlotEnum,
  provider_id: z.string().uuid().nullable(),
})
export type GodReassignRoleInput = z.infer<typeof GodReassignRoleInput>

// deleteBuilding — confirm carries the typed address from the DangerConfirm
// interlock; the backend re-verifies it against the live row before deleting.
export const GodDeleteBuildingInput = z.object({
  id: z.string().uuid(),
  confirm: z.string().min(1).max(400),
})
export type GodDeleteBuildingInput = z.infer<typeof GodDeleteBuildingInput>

// ── Response shapes ──────────────────────────────────────────────────────────
export interface GodBuildingListItem {
  id: string
  city: string | null
  street: string | null
  building_number: string | null
  address: string
  tenant_count: number
  project_count: number
  current_stage: ProjectStageId | string | null
}

export interface GodRoleRef {
  id: string
  full_name: string | null
  email: string | null
}

export interface GodLinkedProvider {
  provider_id: string
  full_name: string | null
  email: string | null
  provider_type: string | null
  role_in_project: string | null
  added_at: string | null
}

export interface GodBuildingTenant {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  apartment_number: string | null
  ownership_percentage: number | null
  is_organizer: boolean
  is_committee_member: boolean
  is_committee_chair: boolean
}

export interface GodBuildingDetail {
  id: string
  city: string | null
  street: string | null
  building_number: string | null
  address: string
  project: {
    id: string
    name: string | null
    current_stage: ProjectStageId | string | null
    target_quarter: string | null
    active_coordinator: GodRoleRef | null
    active_lawyer: GodRoleRef | null
    active_developer: GodRoleRef | null
  } | null
  linked_providers: GodLinkedProvider[]
  tenants: GodBuildingTenant[]
}

// Provider picker for reassignRole — providers are sc_profiles with role='provider'.
export interface GodProviderOption {
  id: string
  full_name: string | null
  email: string | null
  provider_type: string | null
}
