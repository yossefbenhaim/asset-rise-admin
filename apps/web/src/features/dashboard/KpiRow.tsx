// The 8-KPI headline grid for the control-center home. Each card gets a tinted
// icon, a count-up value, a prev-period delta where computable, and (for the
// flow metrics) a 14-day sparkline. Pure presentation — data comes from the
// analyticsRouter.dashboard payload.
import { FileText, CalendarDays, Wallet, TrendingUp, Users, Loader2, AlertTriangle, Gauge } from 'lucide-react'
import type { DashboardData } from '@asset-rise/shared'
import { KpiCard } from '@/components/ui/KpiCard'
import { Sparkline } from '@/components/charts/Sparkline'
import { nis } from '@/lib/format'

export function KpiRow({ d }: { d: DashboardData }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        index={0}
        label="דוחות היום"
        value={d.reportsToday}
        icon={<FileText size={18} />}
        tone="primary"
        sparkline={<Sparkline data={d.reportsSpark} />}
      />
      <KpiCard
        index={1}
        label="דוחות (7 ימים)"
        value={d.reportsWeek}
        delta={d.reportsWeekDelta}
        icon={<CalendarDays size={18} />}
        tone="navy"
      />
      <KpiCard
        index={2}
        label="הכנסות החודש"
        value={d.revenueMonth}
        format={nis}
        delta={d.revenueMonthDelta}
        icon={<Wallet size={18} />}
        tone="gold"
        sparkline={<Sparkline data={d.revenueSpark} />}
      />
      <KpiCard
        index={3}
        label="המרה לתשלום"
        value={d.paidConversion ?? 0}
        format={(n) => `${n.toFixed(1)}%`}
        icon={<TrendingUp size={18} />}
        tone="success"
      />
      <KpiCard
        index={4}
        label="משתמשים חדשים (30 יום)"
        value={d.usersNewMonth}
        delta={d.usersNewMonthDelta}
        icon={<Users size={18} />}
        tone="teal"
      />
      <KpiCard
        index={5}
        label="ציון ממוצע"
        value={d.avgScore ?? 0}
        format={(n) => `${n}`}
        icon={<Gauge size={18} />}
        tone="primary"
      />
      <KpiCard
        index={6}
        label="דוחות בעיבוד"
        value={d.reportsProcessing}
        icon={<Loader2 size={18} />}
        tone={d.reportsProcessing > 0 ? 'navy' : 'primary'}
      />
      <KpiCard
        index={7}
        label="דוחות שנכשלו"
        value={d.reportsFailed}
        icon={<AlertTriangle size={18} />}
        tone={d.reportsFailed > 0 ? 'danger' : 'success'}
      />
    </div>
  )
}
