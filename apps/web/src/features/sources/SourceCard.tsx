// One data source in the health grid: tinted icon, name + description,
// StatusBadge (active/degraded/down), and a footer strip of metrics
// (latency / error count / last-updated). Sources with a real persisted health
// signal are visually distinct from ones still awaiting their first check.
import { motion } from 'framer-motion'
import {
  Map,
  Building2,
  FileText,
  Landmark,
  MapPin,
  Bot,
  Gauge,
  AlertTriangle,
  Clock,
  Activity,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react'
import type { SourceHealth } from '@asset-rise/shared'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { num, timeAgo } from '@/lib/format'

// Server sends an icon *name*; map it to a component here. Unknown → HelpCircle.
const ICONS: Record<string, LucideIcon> = {
  Map,
  Building2,
  FileText,
  Landmark,
  MapPin,
  Bot,
}

// Icon tint per status — keeps the card readable at a glance.
const TINT: Record<SourceHealth['status'], string> = {
  active: 'bg-sc-success-bg text-sc-success',
  degraded: 'bg-sc-warning-bg text-sc-warning',
  down: 'bg-sc-danger-bg text-sc-danger',
}

function fmtLatency(ms: number | null): string {
  if (ms == null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} ש׳` : `${num(ms)} מ״ש`
}

// `index` is accepted for call-site symmetry with the other monitor cards; the
// stagger itself is driven by the grid's parent variants, so it's unused here.
export function SourceCard({ source }: { source: SourceHealth; index?: number }) {
  const Icon = ICONS[source.icon] ?? HelpCircle

  return (
    <motion.div
      className="sc-glass p-4 flex flex-col gap-3 h-full"
      variants={{
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {/* Header: icon + name + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span
            className={`grid place-items-center w-10 h-10 rounded-sc-input shrink-0 ${TINT[source.status]}`}
          >
            <Icon size={19} />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-sc-text truncate" title={source.name}>
              {source.name}
            </div>
            <div className="text-[11.5px] text-sc-text-muted truncate" title={source.description}>
              {source.description}
            </div>
          </div>
        </div>
        <StatusBadge status={source.status} />
      </div>

      {/* Instrumented (real signal) vs awaiting-first-check marker */}
      <div className="flex items-center justify-between gap-2 text-[10.5px] font-semibold">
        {source.instrumented ? (
          <span className="inline-flex items-center gap-1 text-sc-success">
            <Activity size={12} />
            ניטור חי
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sc-text-muted">
            <HelpCircle size={12} />
            ממתין לבדיקה ראשונה
          </span>
        )}
        {source.checkedAt && (
          <span className="inline-flex items-center gap-1 text-sc-text-muted font-medium">
            <Clock size={11} />
            נבדק {timeAgo(source.checkedAt)}
          </span>
        )}
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-3 gap-2 mt-auto pt-1 border-t border-sc-border/60">
        <Metric icon={<Gauge size={13} />} label="זמן תגובה" value={fmtLatency(source.latencyMs)} />
        <Metric
          icon={<AlertTriangle size={13} className={source.errorCount ? 'text-sc-danger' : ''} />}
          label="שגיאות"
          value={source.errorCount != null ? num(source.errorCount) : '—'}
          danger={!!source.errorCount}
        />
        <Metric
          icon={<Clock size={13} />}
          label="הצלחה אחרונה"
          value={source.lastUpdated ? timeAgo(source.lastUpdated) : '—'}
        />
      </div>

      {/* Last error (only when the source recorded one) */}
      {source.lastError && (
        <div
          className="flex items-start gap-1.5 rounded-sc-input bg-sc-danger-bg text-sc-danger px-2 py-1.5 text-[11px] leading-snug"
          title={source.lastError}
        >
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span className="line-clamp-2">{source.lastError}</span>
        </div>
      )}

      {/* Note / diagnostic */}
      {source.note && (
        <div className="text-[11px] text-sc-text-secondary leading-snug">{source.note}</div>
      )}
    </motion.div>
  )
}

function Metric({
  icon,
  label,
  value,
  danger = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="inline-flex items-center gap-1 text-[10px] text-sc-text-muted">
        {icon}
        {label}
      </span>
      <span
        className={`text-[12px] font-bold truncate sc-num ${danger ? 'text-sc-danger' : 'text-sc-text'}`}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}
