import { TRPCError } from '@trpc/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  GodTenantListInput,
  GodTenantGetInput,
  GodEditTenantProfileInput,
  GodSetVaadRolesInput,
  GodMoveBuildingInput,
  GodSetTenantBannedInput,
  GodDeleteTenantInput,
} from '@asset-rise/shared'
import { router, requireLevel } from '../../trpc.js'
import { godProcedure, godMutation } from '../../lib/god.js'
import {
  listTenants,
  getTenant,
  listBuildingOptions,
  loadTenantTarget,
  editTenantProfile,
  setVaadRoles,
  moveBuilding,
  setTenantBanned,
  deleteTenant,
  FkRestrictError,
} from '../../repos/godTenant.repo.js'

// Load the target and reject any row that isn't a tenant, the same guard the
// providers router applies. Run inside the godMutation write fn (so the reject
// is audited as a failed attempt) BEFORE mutating. Prevents the tenant surface
// from banning/editing/moving an admin / super-admin / provider account and
// keeps the audit target_type:'tenant' honest.
async function assertTenantTarget(db: SupabaseClient, id: string): Promise<void> {
  const target = await loadTenantTarget(db, id).catch(() => null)
  if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'דייר לא נמצא' })
  if (target.role !== 'tenant') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'הרשומה אינה דייר' })
  }
}

// God-mode "Tenants + Vaad" router. READS gate on requireLevel('admin.super')
// (direct roleKey membership, the same pattern as routers/god/_index.ts).
// WRITES go through godProcedure + godMutation so every attempt/outcome is
// audited around the write (the airtight pattern from lib/god.ts).
//
// This is an ISOLATED sibling router — the integration step merges it into the
// god router. It does NOT touch _root.ts / _index.ts.
export const godTenantsRouter = router({
  // ── Reads ──────────────────────────────────────────────────────────────────
  list: requireLevel('admin.super')
    .input(GodTenantListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listTenants(ctx.db, input)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
    }),

  get: requireLevel('admin.super')
    .input(GodTenantGetInput)
    .query(async ({ ctx, input }) => {
      try {
        const t = await getTenant(ctx.db, input.id)
        if (!t) throw new TRPCError({ code: 'NOT_FOUND', message: 'דייר לא נמצא' })
        return t
      } catch (e: any) {
        if (e instanceof TRPCError) throw e
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
    }),

  // Building options for the move-building picker + list filter.
  buildingOptions: requireLevel('admin.super').query(async ({ ctx }) => {
    try {
      return await listBuildingOptions(ctx.db)
    } catch (e: any) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
    }
  }),

  // ── Writes (all audited via godMutation) ─────────────────────────────────────
  editTenantProfile: godProcedure
    .input(GodEditTenantProfileInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.tenants.update',
          target_type: 'tenant',
          target_id: input.id,
          meta: {
            full_name: input.full_name,
            phone: input.phone,
            apartment_number: input.apartment_number,
            ownership_percentage: input.ownership_percentage,
          },
        },
        async () => {
          await assertTenantTarget(ctx.db, input.id)
          return editTenantProfile(ctx.db, input)
        },
      ),
    ),

  // "Change the vaad" — toggle committee/organizer roles.
  setVaadRoles: godProcedure
    .input(GodSetVaadRolesInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.tenants.set_vaad',
          target_type: 'tenant',
          target_id: input.id,
          meta: {
            is_committee_chair: input.is_committee_chair,
            is_committee_member: input.is_committee_member,
            is_organizer: input.is_organizer,
          },
        },
        async () => {
          await assertTenantTarget(ctx.db, input.id)
          return setVaadRoles(ctx.db, input)
        },
      ),
    ),

  moveBuilding: godProcedure
    .input(GodMoveBuildingInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.tenants.move_building',
          target_type: 'tenant',
          target_id: input.id,
          meta: { building_id: input.building_id },
        },
        async () => {
          await assertTenantTarget(ctx.db, input.id)
          try {
            return await moveBuilding(ctx.db, input.id, input.building_id)
          } catch (e: any) {
            if (e.message === 'BUILDING_NOT_FOUND') {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'הבניין שנבחר לא נמצא' })
            }
            throw e
          }
        },
      ),
    ),

  // Reversible ban — the default 'soft' destructive action.
  setBanned: godProcedure
    .input(GodSetTenantBannedInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.tenants.set_banned',
          target_type: 'tenant',
          target_id: input.id,
          meta: { banned: input.banned },
        },
        async () => {
          // Don't let a super-admin ban their own session out.
          if (input.id === ctx.user?.id) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'אי אפשר להשבית את עצמך' })
          }
          await assertTenantTarget(ctx.db, input.id)
          return setTenantBanned(ctx.db, input.id, input.banned)
        },
      ),
    ),

  // HARD delete — the escalation. UI types the email; the API re-verifies the
  // email matches the target so a stale id can't be deleted with a wrong email.
  deleteTenant: godProcedure
    .input(GodDeleteTenantInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.tenants.delete',
          target_type: 'tenant',
          target_id: input.id,
          meta: { confirm_email: input.confirm_email },
        },
        async () => {
          if (input.id === ctx.user?.id) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'אי אפשר למחוק את עצמך' })
          }
          const target = await loadTenantTarget(ctx.db, input.id).catch(() => null)
          if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'דייר לא נמצא' })
          // Never act on an admin/super-admin/provider account through the
          // tenant surface — keeps the audit target_type honest and blocks
          // attacking a peer account with an arbitrary auth-user id.
          if (target.role !== 'tenant') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'הרשומה אינה דייר' })
          }
          // Server-side interlock — typed email must match the target's email.
          const expected = (target.email ?? '').trim().toLowerCase()
          if (!expected || input.confirm_email.trim().toLowerCase() !== expected) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'האימייל שהוקלד אינו תואם לדייר המיועד למחיקה',
            })
          }
          try {
            return await deleteTenant(ctx.db, input.id)
          } catch (e: any) {
            if (e instanceof FkRestrictError) {
              throw new TRPCError({ code: 'CONFLICT', message: e.message })
            }
            throw e
          }
        },
      ),
    ),
})
