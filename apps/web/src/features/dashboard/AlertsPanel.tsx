// Operational alerts for the control center: failed / stuck / pending job
// counts as a header strip, then a short list of the most recent failures.
// Healthy state shows a calm "all clear" empty state. Click-through goes to
// the processing module for triage.
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, Clock, Hourglass, ShieldCheck, ChevronLeft } from 'lucide-react'
import type { DashboardAlerts } from '@asset-rise/shared'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { timeAgo } from '@/lib/format'

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  tone: 'danger' | 'navy' | 'warning'
}) {
  const cls =
    tone === 'danger'
      ? 'bg-sc-danger-bg text-sc-danger'
      : tone === 'warning'
        ? 'bg-sc-warning-bg text-sc-warning'
        : 'bg-sc-navy/10 text-sc-navy'
  return (
    <div className={`flex items-center gap-2.5 rounded-sc-input px-3 py-2.5 ${cls}`}>
      <span className="grid place-items-center w-8 h-8 rounded-full bg-white/40">{icon}</span>
      <div className="leading-tight">
        <div className="text-[20px] font-extrabold sc-num">{value}</div>
        <div className="text-[11px] font-semibold opacity-80">{label}</div>
      </div>
    </div>
  )
}

export function AlertsPanel({ alerts, index = 0 }: { alerts: DashboardAlerts; index?: number }) {
  const healthy = alerts.failedJobs === 0 && alerts.stuckJobs === 0 && alerts.pendingJobs === 0

  return (
    <motion.div
      className="sc-glass p-4 flex flex-col gap-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-sc-text m-0">התראות תפעול</h3>
        <Link
          to="/processing"
          className="text-[12px] font-semibold text-sc-primary inline-flex items-center gap-0.5 hover:underline"
        >
          מרכז העיבוד <ChevronLeft size={14} />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat
          icon={<AlertTriangle size={16} />}
          label="נכשלו"
          value={alerts.failedJobs}
          tone="danger"
        />
        <Stat
          icon={<Clock size={16} />}
          label="תקועים >30 דק׳"
          value={alerts.stuckJobs}
          tone="warning"
        />
        <Stat icon={<Hourglass size={16} />} label="בתור" value={alerts.pendingJobs} tone="navy" />
      </div>

      {alerts.recentFailures.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={28} />}
          title={healthy ? 'הכל תקין' : 'אין כשלים אחרונים'}
          body={healthy ? 'אין כשלים, עבודות תקועות או תור ממתין כרגע.' : undefined}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-sc-border/60 -mb-1">
          {alerts.recentFailures.map(f => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold text-sc-text truncate">
                  {f.research_key ?? f.id.slice(0, 8)}
                </div>
                <div className="text-[11px] text-sc-text-muted truncate">
                  {f.error ?? 'שגיאה לא ידועה'} · {f.attempts} ניסיונות · {timeAgo(f.updated_at)}
                </div>
              </div>
              <StatusBadge status="failed" />
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}
