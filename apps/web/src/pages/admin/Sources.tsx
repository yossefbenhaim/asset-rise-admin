// Data Sources Monitor — health of the platform's data sources.
// Thin page: poll sourcesRouter.health, lay out a KPI summary strip + the
// SourceHealthGrid. Heavy UI lives in features/sources/*.
//
// Health now comes from the real sc_source_health table (written by the
// customer pipeline). A source without a row yet is shown as awaiting its
// first health check.
import { motion } from 'framer-motion'
import { RefreshCw, Info, CheckCircle2, AlertTriangle, ServerCrash, Activity } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { KpiCard } from '@/components/ui/KpiCard'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { timeAgo } from '@/lib/format'
import { SourceHealthGrid } from '@/features/sources/SourceHealthGrid'
import { SourceCatalog } from '@/features/sources/SourceCatalog'

export default function AdminSources() {
  const q = trpc.sources.health.useQuery(undefined, {
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  })
  const d = q.data
  // Full source catalog (static structure + live status). Refetched slowly —
  // the structure is static; live dots ride along.
  const cat = trpc.sources.catalog.useQuery(undefined, {
    refetchInterval: 60000,
    refetchOnWindowFocus: false,
  })

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>מקורות נתונים</h1>
          <div className="sub">בריאות וקטלוג מלא של כל מקורות המידע שמזינים את מנוע הניתוח · מתרענן כל 15 שניות</div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        </div>
      ) : q.isError || !d ? (
        <EmptyState
          title="לא ניתן לטעון את נתוני המקורות"
          body={q.error?.message ?? 'אירעה שגיאה בעת טעינת מצב מקורות הנתונים.'}
          action={<Button onClick={() => q.refetch()}>נסה שוב</Button>}
        />
      ) : (
        <motion.div
          className="flex flex-col gap-4"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        >
          {/* KPI summary strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              index={0}
              label="סך מקורות"
              value={d.summary.total}
              icon={<Activity size={18} />}
              tone="navy"
            />
            <KpiCard
              index={1}
              label="פעילים"
              value={d.summary.active}
              icon={<CheckCircle2 size={18} />}
              tone="success"
            />
            <KpiCard
              index={2}
              label="איטיים"
              value={d.summary.degraded}
              icon={<AlertTriangle size={18} />}
              tone={d.summary.degraded > 0 ? 'gold' : 'success'}
            />
            <KpiCard
              index={3}
              label="מושבתים"
              value={d.summary.down}
              icon={<ServerCrash size={18} />}
              tone={d.summary.down > 0 ? 'danger' : 'success'}
            />
          </div>

          {/* Instrumentation caveat — only when some sources haven't reported yet */}
          {d.summary.instrumented < d.summary.total && (
            <div className="flex items-start gap-2 rounded-sc-input bg-sc-light-blue text-sc-primary px-3 py-2 text-[11.5px]">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>
                {d.summary.instrumented}/{d.summary.total} מקורות מדווחים בריאות בזמן אמת מטבלת הניטור.
                שאר המקורות מסומנים «ממתין לבדיקה ראשונה» עד שייכתב עבורם אות בריאות ראשון.
              </span>
            </div>
          )}

          {/* Live health grid (canonical sources reporting right now) */}
          <SourceHealthGrid sources={d.sources} />

          {/* Full source catalog — everything we connect to */}
          {cat.data ? (
            <div className="mt-2">
              <h2 className="text-[15px] font-bold text-sc-text mb-1">הקטלוג המלא</h2>
              <SourceCatalog data={cat.data} />
            </div>
          ) : cat.isLoading ? (
            <div className="flex flex-col gap-3 mt-2">
              <SkeletonCard /><SkeletonCard />
            </div>
          ) : null}

          <div className="text-[10.5px] text-sc-text-muted text-center">
            נתונים עודכנו {timeAgo(d.now)}
          </div>
        </motion.div>
      )}
    </div>
  )
}
