// Processing Monitor — real-time view of the analyzer research pipeline.
// Thin page: poll processingRouter.live every 4s, then lay out KPIs + a
// runs-over-time timeline + the live in-processing jobs (each with a 7-stage
// StageBar) + the waiting queue + recent done/failed strips + the real
// cold-compute runs panel (duration + 3-phase breakdown + source health).
// Heavy UI lives in features/processing/*.
import { motion } from 'framer-motion'
import { RefreshCw, Info, Activity, Hourglass, CheckCircle2, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { KpiCard } from '@/components/ui/KpiCard'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { AreaChartCard } from '@/components/charts/AreaChartCard'
import { BarChartCard } from '@/components/charts/BarChartCard'
import { BRAND } from '@/components/charts/chartTheme'
import { JobCard } from '@/features/processing/JobCard'
import { QueuePanel } from '@/features/processing/QueuePanel'
import { RunsPanel } from '@/features/processing/RunsPanel'

export default function AdminProcessing() {
  const q = trpc.processing.live.useQuery(undefined, {
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
  })
  const d = q.data

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>מרכז העיבוד</h1>
          <div className="sub">מעקב חי אחר צנרת ניתוח הדוחות · מתרענן כל 4 שניות</div>
        </div>
        <Button variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} />
          רענון
        </Button>
      </div>

      {q.isLoading ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
          <SkeletonCard />
        </div>
      ) : q.isError || !d ? (
        <EmptyState
          title="לא ניתן לטעון את נתוני העיבוד"
          body={q.error?.message ?? 'אירעה שגיאה בעת טעינת מרכז העיבוד.'}
          action={<Button onClick={() => q.refetch()}>נסה שוב</Button>}
        />
      ) : (
        <motion.div
          className="flex flex-col gap-4"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        >
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              index={0}
              label="בתור"
              value={d.kpis.inQueue}
              icon={<Hourglass size={18} />}
              tone={d.kpis.inQueue > 0 ? 'navy' : 'primary'}
            />
            <KpiCard
              index={1}
              label="בעיבוד כעת"
              value={d.kpis.processing}
              icon={<Activity size={18} />}
              tone={d.kpis.processing > 0 ? 'primary' : 'primary'}
            />
            <KpiCard
              index={2}
              label="הושלמו היום"
              value={d.kpis.doneToday}
              icon={<CheckCircle2 size={18} />}
              tone="success"
            />
            <KpiCard
              index={3}
              label="נכשלו היום"
              value={d.kpis.failedToday}
              icon={<AlertTriangle size={18} />}
              tone={d.kpis.failedToday > 0 ? 'danger' : 'success'}
            />
          </div>

          {/* Live note */}
          <div className="flex items-start gap-2 rounded-sc-input bg-sc-light-blue text-sc-primary px-3 py-2 text-[11.5px]">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              מתעדכן חי כל 2 שניות. «מחקר AI בתהליך» = משימות המחקר האסינכרוניות שרצות כעת; ריצות
              שהושלמו (עם משך אמיתי ומקורות) מופיעות למטה ב«ריצות אנליזה אחרונות».
            </span>
          </div>

          {/* Runs-over-time timeline (real cold computes, last 24h by hour) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <AreaChartCard
              index={0}
              title="ריצות לאורך זמן"
              sub={`${d.timelineGranularity === 'hour' ? '24 שעות אחרונות · לפי שעה' : 'לפי יום'} · חישובים קרים בלבד`}
              data={d.timeline}
              xKey="label"
              yKey="count"
              color={BRAND.primary}
              height={200}
              valueFmt={(n) => `${n} ריצות`}
            />
            <BarChartCard
              index={1}
              title="משך ריצה ממוצע"
              sub={`${d.timelineGranularity === 'hour' ? 'לפי שעה' : 'לפי יום'} · שניות`}
              data={d.timeline.map((p) => ({
                label: p.label,
                avgSec: p.avgDurationMs != null ? Number((p.avgDurationMs / 1000).toFixed(1)) : 0,
              }))}
              xKey="label"
              yKey="avgSec"
              color={BRAND.gold}
              height={200}
              valueFmt={(n) => `${n} ש׳`}
            />
          </div>

          {/* Main grid: live processing (wide) + queue (narrow) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
            {/* In-processing jobs */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              <div className="flex items-center gap-1.5 text-[14px] font-bold text-sc-text">
                <Activity size={15} className="text-sc-primary" />
                מחקר AI בתהליך
                <span className="text-sc-text-secondary font-semibold sc-num">({d.running.length})</span>
              </div>
              {d.running.length === 0 ? (
                <div className="sc-glass p-4">
                  <EmptyState
                    icon={<Activity size={26} />}
                    title="אין מחקר AI פעיל כרגע"
                    body="כשתיכנס בקשה חדשה, משימת המחקר תופיע כאן בזמן אמת."
                  />
                </div>
              ) : (
                d.running.map((job, i) => (
                  <JobCard key={job.id} job={job} index={i} />
                ))
              )}
            </div>

            {/* Queue */}
            <QueuePanel jobs={d.queue} index={1} />
          </div>

          {/* Real analyzer-compute runs (sc_report_runs) — duration + 3-phase
              breakdown + global source health (features/processing/RunsPanel) */}
          <RunsPanel runs={d.recentRuns} sources={d.sources} index={0} />
        </motion.div>
      )}
    </div>
  )
}

