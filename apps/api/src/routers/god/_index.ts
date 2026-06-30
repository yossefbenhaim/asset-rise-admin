import { TRPCError } from '@trpc/server'
import { GodSearchInput, GodAuditListInput } from '@asset-rise/shared'
import { router, requireLevel } from '../../trpc.js'
import { godSearch, listAudit } from '../../repos/god.repo.js'
import { godBuildingsRouter } from './buildings.js'
import { godTenantsRouter } from './tenants.js'
import { godProvidersRouter } from './providers.js'
import { godNegotiationsRouter } from './negotiations.js'
import { godTendersRouter } from './tenders.js'
import { godPollsRouter } from './polls.js'
import { godWorkflowRouter } from './workflow.js'
import { godDocumentsRouter } from './documents.js'
import { godChatRouter } from './chat.js'
import { godNotificationsRouter } from './notifications.js'
import { godProgressRouter } from './progress.js'
import { godSupportRouter } from './support.js'
import { godMiscRouter } from './misc.js'

// God read endpoints. Gated on requireLevel('admin.super') — DIRECT roleKey
// membership, which CANNOT be loosened by a future sc_permissions seed (a
// stray ('admin','god.search') row would not grant a plain admin access).
// The 'god.search'/'god.audit.list' actions still exist solely for the
// frontend nav/route can() mirror, which only grants them to admin.super.
export const godRouter = router({
  // Wave 1 core-entity domains (each an isolated sibling router).
  buildings: godBuildingsRouter,
  tenants: godTenantsRouter,
  providers: godProvidersRouter,

  // Wave 2 — workflow + deals (each an isolated sibling router).
  negotiations: godNegotiationsRouter,
  tenders: godTendersRouter,
  polls: godPollsRouter,
  workflow: godWorkflowRouter,
  progress: godProgressRouter,
  support: godSupportRouter,

  // Wave 3 — content + communication (each an isolated sibling router).
  documents: godDocumentsRouter,
  chat: godChatRouter,
  notifications: godNotificationsRouter,
  misc: godMiscRouter,

  search: requireLevel('admin.super')
    .input(GodSearchInput)
    .query(async ({ ctx, input }) => {
      try {
        return await godSearch(ctx.db, input.q)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
    }),

  auditList: requireLevel('admin.super')
    .input(GodAuditListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listAudit(ctx.db, input)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
    }),
})
