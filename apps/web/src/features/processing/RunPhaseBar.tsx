// Mini 3-phase breakdown for one real cold-compute run. Renders the
// foundation / free / expensive timings (from sc_report_runs.stages) as a
// single proportional stacked bar plus the per-phase ms underneath. This is
// REAL wall-clock data (not the derived StageBar used for the AI queue).
import type { ProcessingRunStage } from '@asset-rise/shared'

// Canonical phase order + Hebrew labels + colours. Anything outside this set
// is tolerated and rendered in a neutral tone at the end.
const PHASES: { key: string; label: string; cls: string; dot: string }[] = [
  { key: 'foundation', label: 'תשתית', cls: 'bg-sc-navy', dot: 'bg-sc-navy' },
  { key: 'free', label: 'מקורות חינם', cls: 'bg-sc-primary', dot: 'bg-sc-primary' },
  { key: 'expensive', label: 'מקורות יקרים', cls: 'bg-sc-gold', dot: 'bg-sc-gold' },
]

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} מ״ש`
  return `${(ms / 1000).toFixed(1)} ש׳`
}

export function RunPhaseBar({ stages }: { stages: ProcessingRunStage[] }) {
  // Map known phases in canonical order; keep any extras after them.
  const known = PHASES.map(p => ({
    ...p,
    ms: stages.find(s => s.stage === p.key)?.ms ?? 0,
  })).filter(p => p.ms > 0)
  const extras = stages
    .filter(s => !PHASES.some(p => p.key === s.stage) && s.ms > 0)
    .map(s => ({
      key: s.stage,
      label: s.stage,
      cls: 'bg-sc-text-muted',
      dot: 'bg-sc-text-muted',
      ms: s.ms,
    }))
  const segs = [...known, ...extras]
  const total = segs.reduce((a, s) => a + s.ms, 0)
  if (!segs.length || total <= 0) return null

  return (
    <div className="flex flex-col gap-1">
      {/* Proportional stacked bar */}
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-sc-pill bg-sc-bg"
        title="פילוח שלבים (זמן אמת)"
      >
        {segs.map(s => (
          <div
            key={s.key}
            className={s.cls}
            style={{ width: `${(s.ms / total) * 100}%` }}
            title={`${s.label}: ${fmtMs(s.ms)}`}
          />
        ))}
      </div>
      {/* Per-phase legend with ms */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-sc-text-muted">
        {segs.map(s => (
          <span key={s.key} className="inline-flex items-center gap-1">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.dot}`} />
            <span className="text-sc-text-secondary font-semibold">{s.label}</span>
            <span className="sc-num">{fmtMs(s.ms)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
