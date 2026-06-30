// Real analyzer-compute runs (sc_report_runs) — the panel that replaces the
// old inline "ריצות אנליזה אחרונות" list on the Processing page. Shows:
//   • a row of global source-health chips (which categories are healthy),
//   • each run's REAL duration + a mini 3-phase breakdown (foundation / free /
//     expensive ms),
//   • a clear note that these only exist for actual COLD computes (cache hits
//     don't create a run).
import { motion } from 'framer-motion'
import { Activity, Info } from 'lucide-react'
import type { ProcessingRun, ProcessingSourceHealth } from '@asset-rise/shared'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { timeAgo } from '@/lib/format'
import { RunPhaseBar } from './RunPhaseBar'
import { SourceChips } from './SourceChips'

function fmtDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)} ש׳`
}

export function RunsPanel({
  runs,
  sources,
  index = 0,
}: {
  runs: ProcessingRun[]
  sources: ProcessingSourceHealth[]
  index?: number
}) {
  return (
    <motion.div
      className="sc-glass p-4 flex flex-col gap-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-[14px] font-bold text-sc-text m-0 inline-flex items-center gap-1.5">
          <Activity size={15} className="text-sc-primary" />
          ריצות אנליזה אחרונות
          <span className="text-[10px] font-bold text-sc-success bg-sc-success-bg rounded-sc-pill px-2 py-0.5">
            נתוני אמת
          </span>
          <span className="text-sc-text-secondary font-semibold sc-num">({runs.length})</span>
        </h3>
      </div>

      {/* Global source-category health */}
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] font-semibold text-sc-text-secondary">בריאות מקורות (תמונת מצב כללית)</div>
        <SourceChips sources={sources} />
      </div>

      {/* Cold-compute caveat */}
      <div className="flex items-start gap-2 rounded-sc-input bg-sc-light-blue text-sc-primary px-3 py-2 text-[11px]">
        <Info size={13} className="shrink-0 mt-0.5" />
        <span>
          רק חישוב <span className="font-bold">קר</span> אמיתי יוצר ריצה. פגיעות מטמון (cache hit)
          לא נרשמות כריצה — לכן «בעיבוד כעת» יופיע רק בזמן חישוב קר בפועל.
        </span>
      </div>

      {runs.length === 0 ? (
        <EmptyState title="טרם נרשמו ריצות" body="ריצת ניתוח חדשה (לא מהמטמון) תופיע כאן עם משך אמיתי ופילוח שלבים." />
      ) : (
        <ul className="flex flex-col divide-y divide-sc-border/60 -mb-1">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-sc-text truncate" title={r.addressDisplay ?? ''}>
                    {r.addressDisplay ?? '—'}
                  </div>
                  <div className="text-[11px] text-sc-text-muted truncate">
                    {r.error ? `${r.error} · ` : ''}
                    {timeAgo(r.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.durationMs != null && (
                    <span className="text-[11px] font-bold text-sc-text-secondary sc-num">
                      {fmtDuration(r.durationMs)}
                    </span>
                  )}
                  <StatusBadge status={r.status} />
                </div>
              </div>
              {r.stages && r.stages.length > 0 && <RunPhaseBar stages={r.stages} />}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}
