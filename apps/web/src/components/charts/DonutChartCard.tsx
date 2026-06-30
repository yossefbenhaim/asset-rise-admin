import { Cell, Label, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ChartCard, ChartTooltip, PALETTE } from './chartTheme'

// Polished donut: rounded, gradient-filled segments with a big total in the
// center and a clean custom legend (name · value · %) below.
export function DonutChartCard({
  title, sub, data, nameKey = 'name', valueKey = 'value', height = 220, index = 0,
}: {
  title: string; sub?: string; data: any[]; nameKey?: string; valueKey?: string; height?: number; index?: number
}) {
  const total = data.reduce((s, d) => s + (Number(d[valueKey]) || 0), 0)
  const gid = (i: number) => `donut-${index}-${i}`

  return (
    <ChartCard title={title} sub={sub} index={index}>
      <div className="flex flex-col gap-3">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <defs>
              {data.map((_, i) => {
                const c = PALETTE[i % PALETTE.length]
                return (
                  <linearGradient key={i} id={gid(i)} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={c} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={c} stopOpacity={1} />
                  </linearGradient>
                )
              })}
            </defs>
            <Pie
              data={data}
              dataKey={valueKey}
              nameKey={nameKey}
              innerRadius="62%"
              outerRadius="86%"
              paddingAngle={data.length > 1 ? 3 : 0}
              cornerRadius={5}
              stroke="var(--sc-card)"
              strokeWidth={2}
              animationDuration={750}
            >
              {data.map((_, i) => <Cell key={i} fill={`url(#${gid(i)})`} />)}
              <Label
                position="center"
                content={(props: any) => {
                  const { cx, cy } = props.viewBox ?? {}
                  if (cx == null) return null
                  return (
                    <g>
                      <text x={cx} y={cy - 5} textAnchor="middle" className="sc-num" fill="var(--sc-text)" fontSize={24} fontWeight={800}>
                        {total.toLocaleString('he-IL')}
                      </text>
                      <text x={cx} y={cy + 16} textAnchor="middle" fill="var(--sc-text-muted)" fontSize={11}>
                        סה״כ
                      </text>
                    </g>
                  )
                }}
              />
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Custom legend: color · name · value · percent */}
        <ul className="flex flex-col gap-1.5 m-0 p-0 list-none">
          {data.map((d, i) => {
            const v = Number(d[valueKey]) || 0
            const pct = total > 0 ? Math.round((v / total) * 100) : 0
            return (
              <li key={i} className="flex items-center gap-2 text-[12px]">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="text-sc-text-secondary truncate flex-1">{d[nameKey]}</span>
                <span className="text-sc-text font-bold sc-num">{v.toLocaleString('he-IL')}</span>
                <span className="text-sc-text-muted sc-num w-9 text-left">{pct}%</span>
              </li>
            )
          })}
        </ul>
      </div>
    </ChartCard>
  )
}
