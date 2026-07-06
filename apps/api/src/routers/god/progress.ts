import { TRPCError } from '@trpc/server'
import { router, requireLevel } from '../../trpc.js'
import {
  GodUserProgressInput,
  GodBuildingProgressInput,
  GodStuckOverviewInput,
  type UserProgress,
  type BuildingProgress,
  type StuckOverview,
} from '@asset-rise/shared'
import {
  getUserProgress,
  getBuildingProgress,
  getStuckOverview,
} from '../../repos/godProgress.repo.js'

// God-mode Customer Progress Center (read-only). Per-user + per-building
// standing across the 14 stages + a proactive "who's stuck" overview. Gated on
// requireLevel('admin.super') like every other god read.
export const godProgressRouter = router({
  user: requireLevel('admin.super')
    .input(GodUserProgressInput)
    .query(async ({ ctx, input }): Promise<UserProgress> => {
      try {
        return await getUserProgress(ctx.db, input.user_id)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
    }),

  building: requireLevel('admin.super')
    .input(GodBuildingProgressInput)
    .query(async ({ ctx, input }): Promise<BuildingProgress> => {
      try {
        return await getBuildingProgress(ctx.db, input.building_id)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
    }),

  stuck: requireLevel('admin.super')
    .input(GodStuckOverviewInput)
    .query(async ({ ctx, input }): Promise<StuckOverview> => {
      try {
        return await getStuckOverview(ctx.db, input.days ?? 7, input.limit ?? 300)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
    }),
})
