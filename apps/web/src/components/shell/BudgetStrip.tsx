// Full-width, always-on Claude usage strip pinned to the top — mirrors the app's
// Usage screen: session (5h) + weekly (all models) + weekly (Fable), each a
// progress bar of % USED, colored by severity (green < 50, amber 50-80, red > 80).
// Data is the OFFICIAL /usage snapshot pushed by the host cron.
import { Zap } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'

function resetIn(iso: string | null): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000))
  if (mins < 60) return `${mins}ד`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}ש ${mins % 60}ד`
  return `${Math.floor(h / 24)}י ${h % 24}ש`
}

function Seg({
  label,
  used,
  reset,
  className = '',
}: {
  label: string
  used: number
  reset?: string | null
  className?: string
}) {
  const fill = used > 80 ? 'bg-sc-danger' : used > 50 ? 'bg-sc-warning' : 'bg-sc-success'
  return (
    <div className={`flex items-center gap-2 min-w-0 flex-1 ${className}`}>
      <span className="text-[12px] font-bold text-sc-text whitespace-nowrap">{label}</span>
      <div className="flex-1 min-w-[36px] h-2 rounded-full bg-sc-bg overflow-hidden border border-sc-border">
        <div
          className={`h-full ${fill} rounded-full transition-[width]`}
          style={{ width: `${Math.min(100, Math.max(2, used))}%` }}
        />
      </div>
      <span className="text-[11px] font-extrabold tabular-nums text-sc-text whitespace-nowrap">
        {used}%
      </span>
      {reset && (
        <span className="text-[10px] text-sc-text-muted whitespace-nowrap hidden md:inline">
          ↻ {resetIn(reset)}
        </span>
      )}
    </div>
  )
}

export function BudgetStrip() {
  const q = trpc.budget.current.useQuery(undefined, { staleTime: 60_000, refetchInterval: 120_000 })
  const b = q.data
  if (!b) return null
  const title =
    `תקציב Claude (רשמי — מ-/usage). המספרים = % שנוצל.\n` +
    `סשן: ${b.session_pct}% · שבוע (הכל): ${b.week_all_pct}% · Fable: ${b.week_fable_pct}%\n` +
    `עודכן ${new Date(b.updated_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
  return (
    <div className="sc-budget-strip" title={title}>
      <Zap size={14} className="text-sc-primary shrink-0" />
      <span className="text-[11px] font-extrabold text-sc-text-muted shrink-0 hidden sm:inline">
        Claude
      </span>
      <Seg label="סשן" used={b.session_pct} reset={b.session_reset_at} />
      <span className="text-sc-border select-none">|</span>
      <Seg label="שבוע" used={b.week_all_pct} reset={b.week_reset_at} />
      <span className="text-sc-border select-none hidden lg:inline">|</span>
      <Seg label="Fable" used={b.week_fable_pct} className="hidden lg:flex" />
    </div>
  )
}
