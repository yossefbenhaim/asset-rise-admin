import { router } from '../trpc.js'
import { authRouter } from './auth.js'
import { usersRouter } from './users.js'
import { leadsRouter } from './leads.js'
import { buildingsRouter } from './buildings.js'
import { submissionsRouter } from './submissions.js'
import { summaryRouter } from './summary.js'
import { godRouter } from './god/_index.js'
// Control Center modules
import { analyticsRouter } from './analytics.js'
import { reportsRouter } from './reports.js'
import { processingRouter } from './processing.js'
import { paymentsRouter } from './payments.js'
import { sourcesRouter } from './sources.js'
import { aiRouter } from './ai.js'
import { logsRouter } from './logs.js'
import { wongRouter } from './wong.js'
import { pipelineRunsRouter } from './pipelineRuns.js'
import { outreachRouter } from './outreach.js'
import { costsRouter } from './costs.js'
import { agentsRouter } from './agents.js'
import { contentRouter } from './content.js'
import { contentDraftsRouter } from './contentDrafts.js'

export const appRouter = router({
  auth: authRouter,
  summary: summaryRouter,
  users: usersRouter,
  leads: leadsRouter,
  buildings: buildingsRouter,
  submissions: submissionsRouter,
  god: godRouter,
  // Control Center
  analytics: analyticsRouter,
  reports: reportsRouter,
  processing: processingRouter,
  payments: paymentsRouter,
  sources: sourcesRouter,
  ai: aiRouter,
  logs: logsRouter,
  wong: wongRouter,
  pipelineRuns: pipelineRunsRouter,
  outreach: outreachRouter,
  costs: costsRouter,
  agents: agentsRouter,
  content: contentRouter,
  contentDrafts: contentDraftsRouter,
})

export type AppRouter = typeof appRouter
