// Types for the admin Control-Center dashboard (analyticsRouter.dashboard).
// The API computes everything server-side (service-role) and ships a single
// flat payload the page renders directly.

export type DashboardPoint = {
  /** label for the X axis (e.g. 'dd/MM') */
  label: string
  value: number
}

export type DashboardBucket = {
  name: string
  value: number
}

export type DashboardFailure = {
  id: string
  research_key: string | null
  error: string | null
  attempts: number
  updated_at: string
}

export type DashboardAlerts = {
  /** jobs currently in status='failed' */
  failedJobs: number
  /** jobs status='running' for > 30 min (likely stuck) */
  stuckJobs: number
  /** jobs status='pending' waiting in the queue */
  pendingJobs: number
  /** most recent failed jobs, newest first */
  recentFailures: DashboardFailure[]
}

export type DashboardData = {
  // ── headline KPIs ──────────────────────────────────────────────
  reportsToday: number
  reportsWeek: number
  reportsMonth: number
  /** delta % of this 7d window vs the previous 7d window */
  reportsWeekDelta: number | null

  revenuePaid: number // sum of paid sc_payments (all time)
  revenueMonth: number // sum of paid sc_payments this calendar-ish 30d
  revenueMonthDelta: number | null

  usersTotal: number
  usersNewMonth: number
  usersNewMonthDelta: number | null

  reportsProcessing: number // jobs running + pending
  reportsFailed: number // jobs failed

  avgScore: number | null // avg sc_analyzer_reports.score
  /** paid payments / total reports, as a percentage */
  paidConversion: number | null

  // ── chart series ───────────────────────────────────────────────
  reportsPerDay: DashboardPoint[] // last 30 days
  revenuePerDay: DashboardPoint[] // last 30 days
  scoreDistribution: DashboardBucket[] // 0-39 / 40-59 / 60-79 / 80-100
  topSources: DashboardBucket[] // sc_leads.source counts

  // small spark series for KPI cards (last 14d)
  reportsSpark: number[]
  revenueSpark: number[]

  alerts: DashboardAlerts
}
