import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BRAND, ChartCard, ChartTooltip, axisProps, gridStroke } from './chartTheme'

// Polished bar chart: gradient-filled rounded bars sitting on a faint rounded
// "track", a soft hover cursor, and value labels on horizontal bars (top-N
// lists). Vertical for time series, horizontal for ranked categories.
export function BarChartCard({
  title, sub, data, xKey, yKey, color = BRAND.gold, height = 240, index = 0, valueFmt, horizontal = false,
}: {
  title: string; sub?: string; data: any[]; xKey: string; yKey: string
  color?: string; height?: number; index?: number; valueFmt?: (n: number) => string; horizontal?: boolean
}) {
  const gid = `bar-${yKey}-${index}-${horizontal ? 'h' : 'v'}`
  return (
    <ChartCard title={title} sub={sub} index={index}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: horizontal ? 36 : 8, left: horizontal ? 8 : -8, bottom: 0 }} barCategoryGap={horizontal ? '28%' : '22%'}>
          <defs>
            <linearGradient id={gid} x1={horizontal ? '0' : '0'} y1={horizontal ? '0' : '1'} x2={horizontal ? '1' : '0'} y2="0">
              <stop offset="0%" stopColor={color} stopOpacity={0.7} />
              <stop offset="100%" stopColor={color} stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke={gridStroke} strokeOpacity={0.6} horizontal={!horizontal} vertical={horizontal} />
          {horizontal
            ? <><XAxis type="number" {...axisProps} allowDecimals={false} hide /><YAxis type="category" dataKey={xKey} {...axisProps} width={96} /></>
            : <><XAxis dataKey={xKey} {...axisProps} minTickGap={20} /><YAxis {...axisProps} width={40} allowDecimals={false} /></>}
          <Tooltip content={<ChartTooltip valueFmt={valueFmt} />} cursor={{ fill: color, fillOpacity: 0.07, radius: 6 }} />
          <Bar
            dataKey={yKey}
            fill={`url(#${gid})`}
            radius={horizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]}
            maxBarSize={horizontal ? 26 : 40}
            background={{ fill: 'var(--sc-bg)', radius: 8 } as any}
            animationDuration={750}
            animationEasing="ease-out"
          >
            {horizontal && (
              <LabelList
                dataKey={yKey}
                position="right"
                className="sc-num"
                fill="var(--sc-text-secondary)"
                fontSize={11}
                fontWeight={700}
                formatter={((v: any) => (valueFmt ? valueFmt(Number(v)) : Number(v).toLocaleString('he-IL'))) as any}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
