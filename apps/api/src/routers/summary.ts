import { router, requireAction } from '../trpc.js'

export const summaryRouter = router({
  dashboard: requireAction('admin.dashboard').query(async ({ ctx }) => {
    const [
      { count: leadsNew },
      { count: submissionsOpen },
      { count: usersTotal },
      { count: buildingsTotal },
    ] = await Promise.all([
      ctx.db.from('sc_leads').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      ctx.db
        .from('sc_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
      ctx.db.from('sc_profiles').select('id', { count: 'exact', head: true }),
      ctx.db.from('sc_buildings').select('id', { count: 'exact', head: true }),
    ])
    return {
      leads_new: leadsNew ?? 0,
      submissions_open: submissionsOpen ?? 0,
      users_total: usersTotal ?? 0,
      buildings_total: buildingsTotal ?? 0,
    }
  }),
})
