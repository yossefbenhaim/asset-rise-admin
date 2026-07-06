import { TRPCError } from '@trpc/server'
import {
  GodWorkflowProjectListInput,
  GodWorkflowProfileSearchInput,
  GodWorkflowGetInput,
  GodSetTaskStatusInput,
  GodReassignTaskInput,
  GodSetBatonInput,
  GodResolveDualApprovalInput,
  PROJECT_TASK_STATUSES,
  BUILDING_TASK_STATUSES,
  type ProjectTaskStatus,
  type BuildingTaskStatus,
} from '@asset-rise/shared'
import { router, requireLevel } from '../../trpc.js'
import { godProcedure, godMutation } from '../../lib/god.js'
import {
  listWorkflowProjects,
  searchWorkflowProfiles,
  getWorkflowDetail,
  loadTaskTarget,
  loadDualApprovalTarget,
  setTaskStatus,
  reassignTask,
  setBaton,
  resolveDualApproval,
  PG_FK_VIOLATION,
} from '../../repos/godWorkflow.repo.js'

// God-mode "Workflow / Baton / Dual-approval" router (Wave 2). READS gate on
// requireLevel('admin.super') (direct roleKey membership, the same pattern as
// routers/god/_index.ts). WRITES go through godProcedure + godMutation so every
// attempt/outcome is audited around the service-role write (the airtight pattern
// from lib/god.ts). This is an ISOLATED sibling router — the integration step
// merges it into the god router. It does NOT touch _root.ts / _index.ts.
//
// IMPORTANT — these are god overrides. setTaskStatus / reassignTask / setBaton /
// resolveDualApproval write the rows DIRECTLY via service-role, BYPASSING the
// normal workflow engine (dependency gates, the two-party dual-sign, stage
// re-derivation). No hard deletes. Forcing a task done/skipped (project) or
// done/cancelled (building), and force-resolving a dual-approval, are gated
// behind a DangerConfirm in the UI; all are audited here regardless.

function isFkViolation(e: unknown): boolean {
  return (e as any)?.code === PG_FK_VIOLATION
}

function notFound(message = 'הרשומה לא נמצאה'): never {
  throw new TRPCError({ code: 'NOT_FOUND', message })
}

// Re-throw a repo error as a Hebrew TRPCError. NOT_FOUND sentinel → 404,
// anything else → 500 with the underlying message.
function rethrow(e: unknown): never {
  if (e instanceof TRPCError) throw e
  if (e instanceof Error && e.message === 'NOT_FOUND') notFound()
  const message = e instanceof Error ? e.message : 'שגיאה בלתי צפויה'
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
}

// The two task families carry DIFFERENT status CHECK constraints, so the free
// `status` string is validated against the right set per kind — a value the DB
// CHECK would reject is turned into a friendly Hebrew 400 BEFORE the write.
function assertTaskStatusValid(kind: GodSetTaskStatusInput['kind'], status: string): void {
  const allowed: readonly string[] =
    kind === 'project' ? PROJECT_TASK_STATUSES : BUILDING_TASK_STATUSES
  if (!allowed.includes(status)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `סטטוס לא חוקי למשימה מסוג ${kind === 'project' ? 'פרויקט' : 'בניין'}`,
    })
  }
}

export const godWorkflowRouter = router({
  // ── Reads ──────────────────────────────────────────────────────────────────
  // Project picker — the page is per a chosen project.
  projects: requireLevel('admin.super')
    .input(GodWorkflowProjectListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listWorkflowProjects(ctx.db, input)
      } catch (e) {
        rethrow(e)
      }
    }),

  // Profile picker for reassign / setBaton dropdowns.
  profileOptions: requireLevel('admin.super')
    .input(GodWorkflowProfileSearchInput)
    .query(async ({ ctx, input }) => {
      try {
        return await searchWorkflowProfiles(ctx.db, input)
      } catch (e) {
        rethrow(e)
      }
    }),

  // Everything for one project: project tasks + building tasks + dual approvals
  // + the baton holders.
  get: requireLevel('admin.super')
    .input(GodWorkflowGetInput)
    .query(async ({ ctx, input }) => {
      try {
        const detail = await getWorkflowDetail(ctx.db, input.project_id)
        if (!detail) notFound('הפרויקט לא נמצא')
        return detail
      } catch (e) {
        rethrow(e)
      }
    }),

  // ── Writes (all audited via godMutation) ─────────────────────────────────────
  // setTaskStatus — force a project/building task to a new status. Forcing
  // done/skipped (project) or done/cancelled (building) overrides the normal
  // dependency gates; the UI surfaces a DangerConfirm for those. Status validity
  // is checked per family INSIDE the write fn so a rejected attempt is audited.
  setTaskStatus: godProcedure.input(GodSetTaskStatusInput).mutation(({ ctx, input }) =>
    godMutation(
      ctx,
      {
        action: 'god.workflow.set_task_status',
        target_type: input.kind === 'project' ? 'project_task' : 'building_task',
        target_id: input.task_id,
        meta: { kind: input.kind, status: input.status, bypass_gates: true },
      },
      async () => {
        assertTaskStatusValid(input.kind, input.status)
        // Existence check (audited as a failed attempt if missing).
        await loadTaskTarget(ctx.db, input.kind, input.task_id)
        try {
          return await setTaskStatus(ctx.db, input)
        } catch (e) {
          rethrow(e)
        }
      },
    ),
  ),

  // reassignTask — set the owner (project: owner_user_id, building: assigned_to).
  // A null user clears the owner; a bad id trips an FK violation → Hebrew 400.
  reassignTask: godProcedure.input(GodReassignTaskInput).mutation(({ ctx, input }) =>
    godMutation(
      ctx,
      {
        action: 'god.workflow.reassign_task',
        target_type: input.kind === 'project' ? 'project_task' : 'building_task',
        target_id: input.task_id,
        meta: { kind: input.kind, user_id: input.user_id },
      },
      async () => {
        await loadTaskTarget(ctx.db, input.kind, input.task_id)
        try {
          return await reassignTask(ctx.db, input)
        } catch (e) {
          if (isFkViolation(e)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'המשתמש שנבחר אינו קיים במערכת',
            })
          }
          rethrow(e)
        }
      },
    ),
  ),

  // setBaton — set sc_projects.active_<slot>_id (or null to clear). A bad id
  // trips an FK violation → Hebrew 400.
  setBaton: godProcedure.input(GodSetBatonInput).mutation(({ ctx, input }) =>
    godMutation(
      ctx,
      {
        action: 'god.workflow.set_baton',
        target_type: 'project',
        target_id: input.project_id,
        meta: { slot: input.slot, user_id: input.user_id },
      },
      async () => {
        try {
          return await setBaton(ctx.db, input)
        } catch (e) {
          if (isFkViolation(e)) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'המשתמש שנבחר אינו קיים במערכת',
            })
          }
          rethrow(e)
        }
      },
    ),
  ),

  // resolveDualApproval — force a stuck approval to approved/rejected, BYPASSING
  // the two-party sign. The interlock (existence + non-empty confirm token) runs
  // INSIDE godMutation so a rejected/probing attempt is also audited.
  resolveDualApproval: godProcedure.input(GodResolveDualApprovalInput).mutation(({ ctx, input }) =>
    godMutation(
      ctx,
      {
        action: 'god.workflow.resolve_dual_approval',
        target_type: 'dual_approval',
        target_id: input.id,
        meta: { resolution: input.resolution, reason: input.reason, bypass_dual_sign: true },
      },
      async () => {
        if (!input.confirm.trim()) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'נדרש אישור לפעולה' })
        }
        const target = await loadDualApprovalTarget(ctx.db, input.id).catch(e => {
          if (e instanceof Error && e.message === 'NOT_FOUND') {
            notFound('בקשת האישור הכפול לא נמצאה')
          }
          throw e
        })
        // Don't re-resolve an approval that's already terminal — surface a
        // clear Hebrew message instead of silently re-stamping it.
        if (target.status === 'approved' || target.status === 'rejected') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'בקשת האישור כבר הוכרעה',
          })
        }
        try {
          return await resolveDualApproval(ctx.db, input)
        } catch (e) {
          rethrow(e)
        }
      },
    ),
  ),
})

// Re-exported so an integration step / future code can reference the validated
// status unions without re-deriving them.
export type { ProjectTaskStatus, BuildingTaskStatus }
