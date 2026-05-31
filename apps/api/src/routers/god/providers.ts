import { TRPCError } from '@trpc/server'
import {
  GodProviderListInput,
  GodProviderGetInput,
  GodEditProviderProfileInput,
  GodSetProviderBannedInput,
} from '@asset-rise/shared'
import { router, requireLevel } from '../../trpc.js'
import { godProcedure, godMutation } from '../../lib/god.js'
import {
  listProviders,
  getProvider,
  loadProviderTarget,
  editProviderProfile,
  setProviderBanned,
} from '../../repos/godProvider.repo.js'

// God-mode "Providers" router. READS gate on requireLevel('admin.super')
// (direct roleKey membership, the same pattern as routers/god/_index.ts).
// WRITES go through godProcedure + godMutation so every attempt/outcome is
// audited around the write (the airtight pattern from lib/god.ts).
//
// This is an ISOLATED sibling router — the integration step merges it into the
// god router. It does NOT touch _root.ts / _index.ts.
//
// Wave 1 scope: list/search providers, drill into one (sc_profiles +
// sc_provider_profiles + the per-type license/specialization table, read-only),
// edit the common profile (full_name/phone/about/completed_projects), and a
// reversible auth ban. Deep per-type license editing is deferred to later.
export const godProvidersRouter = router({
  // ── Reads ──────────────────────────────────────────────────────────────────
  list: requireLevel('admin.super')
    .input(GodProviderListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listProviders(ctx.db, input)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
    }),

  get: requireLevel('admin.super')
    .input(GodProviderGetInput)
    .query(async ({ ctx, input }) => {
      try {
        const p = await getProvider(ctx.db, input.id)
        if (!p) throw new TRPCError({ code: 'NOT_FOUND', message: 'ספק לא נמצא' })
        return p
      } catch (e: any) {
        if (e instanceof TRPCError) throw e
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
    }),

  // ── Writes (all audited via godMutation) ─────────────────────────────────────
  editProviderProfile: godProcedure
    .input(GodEditProviderProfileInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.providers.update',
          target_type: 'provider',
          target_id: input.id,
          meta: {
            full_name: input.full_name,
            phone: input.phone,
            about: input.about,
            completed_projects: input.completed_projects,
          },
        },
        async () => {
          // Only target a provider row — never a tenant/admin profile.
          const target = await loadProviderTarget(ctx.db, input.id).catch(() => null)
          if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'ספק לא נמצא' })
          if (target.role !== 'provider') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'הרשומה אינה ספק' })
          }
          return editProviderProfile(ctx.db, input)
        },
      ),
    ),

  // Reversible ban — the default 'soft' destructive action (reuse of the
  // users.ts disable pattern via setProviderBanned).
  setBanned: godProcedure
    .input(GodSetProviderBannedInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.providers.set_banned',
          target_type: 'provider',
          target_id: input.id,
          meta: { banned: input.banned },
        },
        async () => {
          // Don't let a super-admin ban their own session out.
          if (input.id === ctx.user?.id) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'אי אפשר להשבית את עצמך' })
          }
          const target = await loadProviderTarget(ctx.db, input.id).catch(() => null)
          if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'ספק לא נמצא' })
          if (target.role !== 'provider') {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'הרשומה אינה ספק' })
          }
          return setProviderBanned(ctx.db, input.id, input.banned)
        },
      ),
    ),
})
