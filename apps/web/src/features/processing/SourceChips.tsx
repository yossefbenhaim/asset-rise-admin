// A compact row of source-category chips from the GLOBAL sc_source_health
// snapshot. The analyzer doesn't persist which sources each individual run
// reached, so this shows the last-known health of every source category
// (active / down) with its last-OK time + latency on hover.
import { CheckCircle2, AlertTriangle, Activity } from 'lucide-react'
import type { ProcessingSourceHealth } from '@asset-rise/shared'
import { timeAgo } from '@/lib/format'

// Hebrew labels for the known source categories the analyzer records.
const LABELS: Record<string, string> = {
  geocode: 'גאוקוד',
  govmap: 'GovMap',
  renewal: 'התחדשות',
  mavat: 'מבא״ת',
  municipal: 'עירוני',
  ai: 'AI',
}

function labelOf(source: string): string {
  return LABELS[source] ?? source
}

export function SourceChips({ sources }: { sources: ProcessingSourceHealth[] }) {
  if (!sources.length) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-sc-text-muted">
        <Activity size={12} />
        טרם נרשמה בריאות מקורות — תופיע אחרי ריצה קרה ראשונה.
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sources.map((s) => {
        const ok = s.status === 'active'
        const cls = ok
          ? 'bg-sc-success-bg text-sc-success'
          : 'bg-sc-danger-bg text-sc-danger'
        const tip = [
          ok ? 'תקין' : 'תקול',
          s.latencyMs != null ? `~${Math.round(s.latencyMs)} מ״ש` : null,
          s.lastOkAt ? `נראה לאחרונה ${timeAgo(s.lastOkAt)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
        return (
          <span
            key={s.source}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sc-pill text-[10px] font-bold ${cls}`}
            title={tip}
          >
            {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
            {labelOf(s.source)}
          </span>
        )
      })}
    </div>
  )
}
