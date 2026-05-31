import { TRPCError } from '@trpc/server'
import {
  GodBuildingGetInput,
  GodEditBuildingInput,
  GodForceProjectStageInput,
  GodReassignRoleInput,
  GodDeleteBuildingInput,
} from '@asset-rise/shared'
import { router, requireLevel } from '../../trpc.js'
import { godProcedure, godMutation } from '../../lib/god.js'
import {
  listBuildings,
  getBuildingDetail,
  listProviders,
  editBuilding,
  forceProjectStage,
  reassignRole,
  deleteBuilding,
  getBuildingAddress,
  PG_FK_VIOLATION,
} from '../../repos/godBuildings.repo.js'

// God-mode Buildings + Projects. READS gate on requireLevel('admin.super')
// (direct membership — never requireAction). WRITES go through godMutation so
// the attempt + outcome are both audited around the service-role write.
//
// Errors are surfaced as Hebrew TRPCErrors. The most important translation is
// the FK-restrict case on deleteBuilding: a building that still has rows which
// reference it via ON DELETE RESTRICT/NO ACTION must yield a clear Hebrew
// message instead of a raw Postgres 500.

// Narrow a thrown DB error to the Postgres FK-violation SQLSTATE. The Supabase
// PostgrestError carries `.code`; a wrapped pg error may carry it too.
function isFkViolation(e: unknown): boolean {
  const code = (e as any)?.code
  return code === PG_FK_VIOLATION
}

function notFound(): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'הרשומה לא נמצאה' })
}

// Re-throw a repo error as a Hebrew TRPCError. NOT_FOUND sentinel → 404,
// anything else → 500 with the underlying message.
function rethrow(e: unknown): never {
  if (e instanceof Error && e.message === 'NOT_FOUND') notFound()
  const message = e instanceof Error ? e.message : 'שגיאה בלתי צפויה'
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
}

export const godBuildingsRouter = router({
  // ── Reads ──────────────────────────────────────────────────────────────────
  list: requireLevel('admin.super').query(async ({ ctx }) => {
    try {
      return await listBuildings(ctx.db)
    } catch (e) {
      rethrow(e)
    }
  }),

  get: requireLevel('admin.super')
    .input(GodBuildingGetInput)
    .query(async ({ ctx, input }) => {
      try {
        const detail = await getBuildingDetail(ctx.db, input.id)
        if (!detail) notFound()
        return detail
      } catch (e) {
        rethrow(e)
      }
    }),

  // Provider options for the reassignRole dropdown.
  providerOptions: requireLevel('admin.super').query(async ({ ctx }) => {
    try {
      return await listProviders(ctx.db)
    } catch (e) {
      rethrow(e)
    }
  }),

  // ── Writes (all audited via godMutation) ─────────────────────────────────────
  editBuilding: godProcedure
    .input(GodEditBuildingInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.buildings.update',
          target_type: 'building',
          target_id: input.id,
          meta: {
            city: input.city ?? undefined,
            street: input.street ?? undefined,
            building_number: input.building_number ?? undefined,
          },
        },
        async () => {
          try {
            return await editBuilding(ctx.db, input)
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  forceProjectStage: godProcedure
    .input(GodForceProjectStageInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.buildings.force_stage',
          target_type: 'project',
          target_id: input.project_id,
          meta: { stage: input.stage },
        },
        async () => {
          try {
            return await forceProjectStage(ctx.db, input)
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  reassignRole: godProcedure
    .input(GodReassignRoleInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.buildings.reassign_role',
          target_type: 'project',
          target_id: input.project_id,
          meta: { slot: input.slot, provider_id: input.provider_id },
        },
        async () => {
          try {
            return await reassignRole(ctx.db, input)
          } catch (e) {
            // A non-null provider_id that isn't a real profile violates the
            // active_*_id FK (sc_profiles) — surface a clear Hebrew message.
            if (isFkViolation(e)) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'הספק שנבחר אינו קיים במערכת',
              })
            }
            rethrow(e)
          }
        },
      ),
    ),

  deleteBuilding: godProcedure
    .input(GodDeleteBuildingInput)
    .mutation(async ({ ctx, input }) => {
      // The interlock (existence + typed-address match) runs INSIDE godMutation
      // so EVERY attempt at this — the single most destructive op — is audited,
      // including a rejected/probing one with a wrong or stale confirm token.
      return godMutation(
        ctx,
        {
          action: 'god.buildings.delete',
          target_type: 'building',
          target_id: input.id,
          meta: { confirm: input.confirm },
        },
        async () => {
          const live = await getBuildingAddress(ctx.db, input.id)
          if (!live) notFound()
          if (input.confirm.trim() !== live.address.trim()) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'הכתובת שהוקלדה אינה תואמת את כתובת הבניין',
            })
          }
          try {
            return await deleteBuilding(ctx.db, input.id)
          } catch (e) {
            if (isFkViolation(e)) {
              throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message:
                  'לא ניתן למחוק את הבניין — קיימות רשומות מקושרות שמונעות מחיקה (למשל מו״מ עם יו״ר משויך). יש להסיר אותן תחילה.',
              })
            }
            rethrow(e)
          }
        },
      )
    }),
})
