import { router } from '../trpc.js'
import { authRouter } from './auth.js'
import { usersRouter } from './users.js'
import { leadsRouter } from './leads.js'
import { buildingsRouter } from './buildings.js'
import { submissionsRouter } from './submissions.js'
import { summaryRouter } from './summary.js'
import { godRouter } from './god/_index.js'

export const appRouter = router({
  auth: authRouter,
  summary: summaryRouter,
  users: usersRouter,
  leads: leadsRouter,
  buildings: buildingsRouter,
  submissions: submissionsRouter,
  god: godRouter,
})

export type AppRouter = typeof appRouter
