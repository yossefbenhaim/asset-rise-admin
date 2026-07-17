// Always-on Claude quota indicator in the top bar. Shows the OFFICIAL usage
// (from `claude -p "/usage"`, pushed by the host cron) — the same numbers as the
// Claude app: session (5h) + weekly (all models) + weekly (Fable). Values are
// "% remaining"; colors: green >50% left, amber 20-50%, red <20%.
import { Zap } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'

const cls = (left: number) =>
  left > 50 ? 'text-sc-success' : left >= 20 ? 'text-sc-warning' : 'text-sc-danger'

function resetIn(iso: string | null): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000))
  if (mins < 60) return `עוד ${mins}ד`
  const h = Math.floor(mins / 60)
  if (h < 24) return `עוד ${h}ש ${mins % 60}ד`
  return `עוד ${Math.floor(h / 24)}י ${h % 24}ש`
}

export function BudgetBar() {
  const q = trpc.budget.current.useQuery(undefined, { staleTime: 60_000, refetchInterval: 120_000 })
  const b = q.data
  if (!b) return null

  const sess = 100 - b.session_pct
  const all = 100 - b.week_all_pct
  const fable = 100 - b.week_fable_pct

  const title =
    `תקציב Claude (רשמי — מ-/usage)\n` +
    `סשן (5ש): נשאר ${sess}% · מתאפס ${resetIn(b.session_reset_at)}\n` +
    `שבועי (כל המודלים): נשאר ${all}% · מתאפס ${resetIn(b.week_reset_at)}\n` +
    `שבועי (Fable): נשאר ${fable}%\n` +
    `עודכן ${new Date(b.updated_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <div
      className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-sc-pill border border-sc-border bg-sc-bg text-[12px] font-bold"
      title={title}
      aria-label={title}
    >
      <Zap size={13} className={cls(Math.min(sess, all))} />
      <span className={cls(sess)}>סשן {sess}%</span>
      <span className="text-sc-text-muted">·</span>
      <span className={cls(all)}>שבוע {all}%</span>
      <span className="text-sc-text-muted hidden lg:inline">·</span>
      <span className={`${cls(fable)} hidden lg:inline`}>Fable {fable}%</span>
    </div>
  )
}
