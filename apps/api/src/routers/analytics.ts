import { router, requireAction } from '../trpc.js'
import type { DashboardData, DashboardPoint, DashboardBucket } from '@asset-rise/shared'

// ── date helpers ───────────────────────────────────────────────────
const DAY = 86_400_000
function dayKey(d: Date): string {
  // local-ish ISO date (YYYY-MM-DD) for bucketing
  return d.toISOString().slice(0, 10)
}
function dayLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
/** % change of `cur` vs `prev`; null when prev is 0/undefined (no baseline). */
function delta(cur: number, prev: number): number | null {
  if (!prev) return null
  return ((cur - prev) / prev) * 100
}

export const analyticsRouter = router({
  dashboard: requireAction('admin.dashboard').query(async ({ ctx }): Promise<DashboardData> => {
    const now = Date.now()
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
    const iso = (ms: number) => new Date(ms).toISOString()
    const t30 = iso(now - 30 * DAY)
    const t14 = now - 14 * DAY
    const t7 = now - 7 * DAY
    const t14ago = now - 14 * DAY // prev 7d window starts here

    const [
      reportsTodayRes,
      reportsWeekRes,
      reportsPrevWeekRes,
      reportsMonthRowsRes,        // rows w/ created_at + score for last 30d series + dist
      scoreAllRes,                // all scores for avg + full distribution
      usersTotalRes,
      usersNewMonthRes,
      usersPrevMonthRes,
      paymentsPaidRes,            // paid rows last 30d (amount + paid_at) for series
      paymentsPaidAllRes,         // sum all-time paid
      paymentsPrevMonthRes,       // paid prev 30d for delta
      reportsTotalRes,            // total reports for conversion denominator
      paidCountRes,               // count of paid payments for conversion numerator
      jobsRunningRes,
      jobsPendingRes,
      jobsFailedCountRes,
      jobsRunningRowsRes,         // running rows to detect stuck (>30min)
      recentFailuresRes,
      leadsSourcesRes,
    ] = await Promise.all([
      ctx.db.from('sc_analyzer_reports').select('id', { count: 'exact', head: true }).gte('created_at', startToday.toISOString()),
      ctx.db.from('sc_analyzer_reports').select('id', { count: 'exact', head: true }).gte('created_at', iso(t7)),
      ctx.db.from('sc_analyzer_reports').select('id', { count: 'exact', head: true }).gte('created_at', iso(t14ago)).lt('created_at', iso(t7)),
      ctx.db.from('sc_analyzer_reports').select('created_at, score').gte('created_at', t30),
      ctx.db.from('sc_analyzer_reports').select('score'),
      ctx.db.from('sc_profiles').select('id', { count: 'exact', head: true }),
      ctx.db.from('sc_profiles').select('id', { count: 'exact', head: true }).gte('created_at', iso(now - 30 * DAY)),
      ctx.db.from('sc_profiles').select('id', { count: 'exact', head: true }).gte('created_at', iso(now - 60 * DAY)).lt('created_at', iso(now - 30 * DAY)),
      ctx.db.from('sc_payments').select('amount, paid_at, created_at').eq('status', 'paid').gte('created_at', t30),
      ctx.db.from('sc_payments').select('amount').eq('status', 'paid'),
      ctx.db.from('sc_payments').select('amount').eq('status', 'paid').gte('created_at', iso(now - 60 * DAY)).lt('created_at', iso(now - 30 * DAY)),
      ctx.db.from('sc_analyzer_reports').select('id', { count: 'exact', head: true }),
      ctx.db.from('sc_payments').select('id', { count: 'exact', head: true }).eq('status', 'paid'),
      ctx.db.from('sc_analyzer_jobs').select('id', { count: 'exact', head: true }).eq('status', 'running'),
      ctx.db.from('sc_analyzer_jobs').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ctx.db.from('sc_analyzer_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      ctx.db.from('sc_analyzer_jobs').select('updated_at').eq('status', 'running'),
      ctx.db.from('sc_analyzer_jobs').select('id, research_key, error, attempts, updated_at').eq('status', 'failed').order('updated_at', { ascending: false }).limit(6),
      ctx.db.from('sc_leads').select('source'),
    ])

    // ── KPIs ──
    const reportsToday = reportsTodayRes.count ?? 0
    const reportsWeek = reportsWeekRes.count ?? 0
    const reportsPrevWeek = reportsPrevWeekRes.count ?? 0
    const reportsWeekDelta = delta(reportsWeek, reportsPrevWeek)

    const monthRows = (reportsMonthRowsRes.data ?? []) as { created_at: string; score: number | null }[]
    const reportsMonth = monthRows.length

    const usersTotal = usersTotalRes.count ?? 0
    const usersNewMonth = usersNewMonthRes.count ?? 0
    const usersPrevMonth = usersPrevMonthRes.count ?? 0
    const usersNewMonthDelta = delta(usersNewMonth, usersPrevMonth)

    const paidMonthRows = (paymentsPaidRes.data ?? []) as { amount: number; paid_at: string | null; created_at: string }[]
    const revenuePaid = ((paymentsPaidAllRes.data ?? []) as { amount: number }[]).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const revenueMonth = paidMonthRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const revenuePrevMonth = ((paymentsPrevMonthRes.data ?? []) as { amount: number }[]).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const revenueMonthDelta = delta(revenueMonth, revenuePrevMonth)

    const reportsProcessing = (jobsRunningRes.count ?? 0) + (jobsPendingRes.count ?? 0)
    const reportsFailed = jobsFailedCountRes.count ?? 0

    const allScores = ((scoreAllRes.data ?? []) as { score: number | null }[])
      .map(r => r.score).filter((n): n is number => typeof n === 'number')
    const avgScore = allScores.length ? Math.round(allScores.reduce((s, n) => s + n, 0) / allScores.length) : null

    const reportsTotal = reportsTotalRes.count ?? 0
    const paidCount = paidCountRes.count ?? 0
    const paidConversion = reportsTotal ? (paidCount / reportsTotal) * 100 : null

    // ── reportsPerDay (30d) + reportsSpark (14d) ──
    const reportsByDay = new Map<string, number>()
    for (const r of monthRows) {
      const k = dayKey(new Date(r.created_at))
      reportsByDay.set(k, (reportsByDay.get(k) ?? 0) + 1)
    }
    const reportsPerDay: DashboardPoint[] = []
    const reportsSpark: number[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * DAY)
      const v = reportsByDay.get(dayKey(d)) ?? 0
      reportsPerDay.push({ label: dayLabel(d), value: v })
      if (now - i * DAY >= t14) reportsSpark.push(v)
    }

    // ── revenuePerDay (30d) + revenueSpark (14d) ──
    const revByDay = new Map<string, number>()
    for (const p of paidMonthRows) {
      const k = dayKey(new Date(p.paid_at ?? p.created_at))
      revByDay.set(k, (revByDay.get(k) ?? 0) + (Number(p.amount) || 0))
    }
    const revenuePerDay: DashboardPoint[] = []
    const revenueSpark: number[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * DAY)
      const v = revByDay.get(dayKey(d)) ?? 0
      revenuePerDay.push({ label: dayLabel(d), value: v })
      if (now - i * DAY >= t14) revenueSpark.push(v)
    }

    // ── score distribution (buckets) ──
    const buckets = [
      { name: '0–39', value: 0 },
      { name: '40–59', value: 0 },
      { name: '60–79', value: 0 },
      { name: '80–100', value: 0 },
    ]
    for (const s of allScores) {
      if (s < 40) buckets[0].value++
      else if (s < 60) buckets[1].value++
      else if (s < 80) buckets[2].value++
      else buckets[3].value++
    }
    const scoreDistribution: DashboardBucket[] = buckets

    // ── top lead sources ──
    const srcCount = new Map<string, number>()
    for (const row of (leadsSourcesRes.data ?? []) as { source: string | null }[]) {
      const k = row.source && row.source.trim() ? row.source : 'ישיר'
      srcCount.set(k, (srcCount.get(k) ?? 0) + 1)
    }
    const topSources: DashboardBucket[] = [...srcCount.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6)

    // ── alerts ──
    const runningRows = (jobsRunningRowsRes.data ?? []) as { updated_at: string }[]
    const stuckJobs = runningRows.filter(r => {
      const t = new Date(r.updated_at).getTime()
      return Number.isFinite(t) && now - t > 30 * 60_000
    }).length
    const recentFailures = ((recentFailuresRes.data ?? []) as {
      id: string; research_key: string | null; error: string | null; attempts: number | null; updated_at: string
    }[]).map(r => ({
      id: r.id,
      research_key: r.research_key ?? null,
      error: r.error ?? null,
      attempts: r.attempts ?? 0,
      updated_at: r.updated_at,
    }))

    return {
      reportsToday,
      reportsWeek,
      reportsMonth,
      reportsWeekDelta,
      revenuePaid,
      revenueMonth,
      revenueMonthDelta,
      usersTotal,
      usersNewMonth,
      usersNewMonthDelta,
      reportsProcessing,
      reportsFailed,
      avgScore,
      paidConversion,
      reportsPerDay,
      revenuePerDay,
      scoreDistribution,
      topSources,
      reportsSpark,
      revenueSpark,
      alerts: {
        failedJobs: reportsFailed,
        stuckJobs,
        pendingJobs: jobsPendingRes.count ?? 0,
        recentFailures,
      },
    }
  }),
})
