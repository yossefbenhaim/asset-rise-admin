import { motion } from 'framer-motion'
import { ChartCard, PALETTE } from './chartTheme'

// Ranked horizontal "progress" bars — a clean alternative to a Recharts bar
// chart for top-N lists. Looks intentional even with a single item (where a
// lone floating bar reads as broken). Each row: name · value + a track with a
// gradient fill proportional to the max.
export function RankedBarsCard({
  title, sub, data, nameKey = 'name', valueKey = 'value', index = 0, valueFmt,
}: {
  title: string; sub?: string; data: any[]
  nameKey?: string; valueKey?: string; index?: number; valueFmt?: (n: number) => string
}) {
  const rows = [...(data ?? [])].sort((a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0))
  const max = rows.reduce((m, d) => Math.max(m, Number(d[valueKey]) || 0), 0) || 1

  return (
    <ChartCard title={title} sub={sub} index={index}>
      {rows.length === 0 ? (
        <div className="grid place-items-center h-full min-h-[160px] text-[12.5px] text-sc-text-muted">
          אין נתונים עדיין
        </div>
      ) : (
        <ul className="flex flex-col gap-3.5 m-0 p-0 list-none">
          {rows.map((d, i) => {
            const v = Number(d[valueKey]) || 0
            const pct = Math.max(3, Math.round((v / max) * 100)) // floor so tiny values still show
            const c = PALETTE[i % PALETTE.length]
            return (
              <li key={i} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c }} />
                    <span className="font-semibold text-sc-text truncate">{d[nameKey]}</span>
                  </span>
                  <span className="font-bold text-sc-text sc-num shrink-0">
                    {valueFmt ? valueFmt(v) : v.toLocaleString('he-IL')}
                  </span>
                </div>
                <div className="h-2.5 rounded-sc-pill bg-sc-bg overflow-hidden">
                  <motion.div
                    className="h-full rounded-sc-pill"
                    style={{ background: `linear-gradient(90deg, ${c}99, ${c})` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </ChartCard>
  )
}
