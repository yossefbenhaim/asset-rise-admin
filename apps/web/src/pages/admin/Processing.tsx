// Processing Monitor — real-time view of the analyzer research pipeline.
// Thin page: poll processingRouter.live every 4s, then lay out KPIs + the
// live in-processing jobs (each with a 7-stage StageBar) + the waiting queue
// + a recent done/failed strip. Heavy UI lives in features/processing/*.
import { motion } from 'framer-motion'
import { RefreshCw, Info, Activity, Hourglass, CheckCircle2, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { KpiCard } from '@/components/ui/KpiCard'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { timeAgo } from '@/lib/format'
import { JobCard } from '@/features/processing/JobCard'
import { QueuePanel } from '@/features/processing/QueuePanel'

export default function AdminProcessing() {
  const q = trpc.processing.live.useQuery(undefined, {
    refetchInterval: 4000,
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

          {/* Derived-stage caveat */}
          {d.derivedStages && (
            <div className="flex items-start gap-2 rounded-sc-input bg-sc-light-blue text-sc-primary px-3 py-2 text-[11.5px]">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>
                השלב הנוכחי בכל עבודה הוא <span className="font-bold">הערכה</span> לפי זמן ריצה —
                תזמון מדויק לכל שלב יישמר בשלב מאוחר יותר.
              </span>
            </div>
          )}

          {/* Main grid: live processing (wide) + queue (narrow) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
            {/* In-processing jobs */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              <div className="flex items-center gap-1.5 text-[14px] font-bold text-sc-text">
                <Activity size={15} className="text-sc-primary" />
                בעיבוד כעת
                <span className="text-sc-text-secondary font-semibold sc-num">({d.running.length})</span>
              </div>
              {d.running.length === 0 ? (
                <div className="sc-glass p-4">
                  <EmptyState
                    icon={<Activity size={26} />}
                    title="אין עבודות בעיבוד"
                    body="כל העבודות הושלמו או ממתינות בתור."
                  />
                </div>
              ) : (
                d.running.map((job, i) => (
                  <JobCard key={job.id} job={job} stages={d.stages} index={i} />
                ))
              )}
            </div>

            {/* Queue */}
            <QueuePanel jobs={d.queue} index={1} />
          </div>

          {/* Recent done + failed strips */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <RecentList
              title="הושלמו לאחרונה"
              icon={<CheckCircle2 size={15} className="text-sc-success" />}
              jobs={d.recentDone}
              kind="done"
            />
            <RecentList
              title="כשלים אחרונים"
              icon={<AlertTriangle size={15} className="text-sc-danger" />}
              jobs={d.recentFailed}
              kind="failed"
            />
          </div>
        </motion.div>
      )}
    </div>
  )
}

// A compact recent-jobs list (done or failed). Failed rows surface the reason.
function RecentList({
  title, icon, jobs, kind,
}: {
  title: string
  icon: React.ReactNode
  jobs: import('@asset-rise/shared').ProcessingJob[]
  kind: 'done' | 'failed'
}) {
  return (
    <div className="sc-glass p-4 flex flex-col gap-3">
      <h3 className="text-[14px] font-bold text-sc-text m-0 inline-flex items-center gap-1.5">
        {icon}{title}
        <span className="text-sc-text-secondary font-semibold sc-num">({jobs.length})</span>
      </h3>
      {jobs.length === 0 ? (
        <EmptyState
          title={kind === 'failed' ? 'אין כשלים אחרונים' : 'אין עבודות שהושלמו'}
          body={kind === 'failed' ? 'הצנרת רצה ללא שגיאות.' : undefined}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-sc-border/60 -mb-1">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-sc-text truncate" title={j.label}>
                  {j.label}
                </div>
                <div className="text-[11px] text-sc-text-muted truncate">
                  {kind === 'failed'
                    ? `${j.error ?? 'שגיאה לא ידועה'} · ${timeAgo(j.updated_at)}`
                    : timeAgo(j.completed_at ?? j.updated_at)}
                </div>
              </div>
              <StatusBadge status={j.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
