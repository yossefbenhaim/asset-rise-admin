// Always-on Claude quota indicator in the top bar. Reads the snapshot the host
// cron pushes (budget.current). Colors: green >50% left, amber 20-50%, red <20%.
import { Zap } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'

const remain = (used: number, capM: number) =>
  Math.max(0, 100 - Math.round((used / (capM * 1_000_000)) * 100))

const cls = (p: number) =>
  p > 50 ? 'text-sc-success' : p >= 20 ? 'text-sc-warning' : 'text-sc-danger'

export function BudgetBar() {
  const q = trpc.budget.current.useQuery(undefined, {
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
  const b = q.data
  if (!b) return null

  const sess = remain(b.session_used_tokens, b.session_cap_m)
  const opus = remain(b.week_opus_tokens, b.week_opus_cap_m)
  const sonnet = remain(b.week_sonnet_tokens, b.week_sonnet_cap_m)
  const haiku = remain(b.week_haiku_tokens, b.week_haiku_cap_m)

  let resetTxt = ''
  if (b.session_reset_at) {
    const mins = Math.max(
      0,
      Math.round((new Date(b.session_reset_at).getTime() - Date.now()) / 60000),
    )
    resetTxt = `מתאפס בעוד ${Math.floor(mins / 60)}ש ${mins % 60}ד`
  }
  const title =
    `תקציב Claude (הערכה — המספרים אמיתיים, ה-% מול תקרה מוגדרת)\n` +
    `סשן (5ש): נשאר ${sess}% · ${resetTxt}\n` +
    `שבועי — Opus ${opus}% · Sonnet ${sonnet}% · Haiku ${haiku}%\n` +
    `עודכן ${new Date(b.updated_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <div
      className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-sc-pill border border-sc-border bg-sc-bg text-[12px] font-bold"
      title={title}
      aria-label={title}
    >
      <Zap size={13} className={cls(Math.min(sess, opus))} />
      <span className={cls(sess)}>סשן {sess}%</span>
      <span className="text-sc-text-muted">·</span>
      <span className={cls(opus)}>Opus {opus}%</span>
      <span className={`text-sc-text-muted hidden lg:inline`}>·</span>
      <span className={`${cls(sonnet)} hidden lg:inline`}>Son {sonnet}%</span>
      <span className={`${cls(haiku)} hidden lg:inline`}>Hai {haiku}%</span>
    </div>
  )
}
