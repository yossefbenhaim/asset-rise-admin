// Control-Center home — the rich operational dashboard. Thin page: fetch the
// single analyticsRouter.dashboard payload, then lay out KPIs + charts + alerts.
// All heavy UI lives in features/dashboard/*.
import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { useUser } from '@/lib/auth/session'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { AreaChartCard } from '@/components/charts/AreaChartCard'
import { BarChartCard } from '@/components/charts/BarChartCard'
import { DonutChartCard } from '@/components/charts/DonutChartCard'
import { nis } from '@/lib/format'
import { KpiRow } from '@/features/dashboard/KpiRow'
import { AlertsPanel } from '@/features/dashboard/AlertsPanel'
import { PinnedReports } from '@/features/dashboard/PinnedReports'
import { DashboardSkeleton } from '@/features/dashboard/DashboardSkeleton'

export default function AdminHome() {
  const user = useUser()
  const q = trpc.analytics.dashboard.useQuery(undefined, { refetchOnWindowFocus: false })

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>שלום {user?.full_name?.split(' ')[0] ?? ''}</h1>
          <div className="sub">לוח בקרה — מבט-על על המערכת</div>
        </div>
        <Button variant="ghost" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw size={15} className={q.isFetching ? 'animate-spin' : ''} />
          רענון
        </Button>
      </div>

      {q.isLoading ? (
        <DashboardSkeleton />
      ) : q.isError || !q.data ? (
        <EmptyState
          title="לא ניתן לטעון את הנתונים"
          body={q.error?.message ?? 'אירעה שגיאה בעת טעינת לוח הבקרה.'}
          action={<Button onClick={() => q.refetch()}>נסה שוב</Button>}
        />
      ) : (
        <motion.div
          className="flex flex-col gap-4"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        >
          <KpiRow d={q.data} />

          <PinnedReports index={0} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <AreaChartCard
              index={0}
              title="דוחות ליום"
              sub="30 הימים האחרונים"
              data={q.data.reportsPerDay}
              xKey="label"
              yKey="value"
            />
            <BarChartCard
              index={1}
              title="הכנסות ליום"
              sub="30 הימים האחרונים"
              data={q.data.revenuePerDay}
              xKey="label"
              yKey="value"
              valueFmt={nis}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <DonutChartCard
              index={0}
              title="התפלגות ציונים"
              sub="כל הדוחות"
              data={q.data.scoreDistribution}
              nameKey="name"
              valueKey="value"
            />
            <BarChartCard
              index={1}
              title="מקורות מובילים"
              sub="לפי מספר פניות"
              data={q.data.topSources}
              xKey="name"
              yKey="value"
              horizontal
            />
            <AlertsPanel index={2} alerts={q.data.alerts} />
          </div>
        </motion.div>
      )}
    </div>
  )
}
