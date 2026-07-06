import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BRAND, ChartCard, ChartTooltip, axisProps, gridStroke } from './chartTheme'

// Polished area chart: a soft layered gradient fill, a crisp gradient stroke, a
// glowing active dot, and a faint horizontal-only grid. Recharts under the hood,
// styled to match the brand in light + dark.
export function AreaChartCard({
  title,
  sub,
  data,
  xKey,
  yKey,
  color = BRAND.primary,
  height = 240,
  index = 0,
  valueFmt,
}: {
  title: string
  sub?: string
  data: any[]
  xKey: string
  yKey: string
  color?: string
  height?: number
  index?: number
  valueFmt?: (n: number) => string
}) {
  const gid = `area-${yKey}-${index}`
  const sid = `stroke-${yKey}-${index}`
  return (
    <ChartCard title={title} sub={sub} index={index}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.38} />
              <stop offset="55%" stopColor={color} stopOpacity={0.12} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={sid} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={BRAND.primaryLight} />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="4 4"
            stroke={gridStroke}
            strokeOpacity={0.6}
            vertical={false}
          />
          <XAxis dataKey={xKey} {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} width={40} allowDecimals={false} />
          <Tooltip
            content={<ChartTooltip valueFmt={valueFmt} />}
            cursor={{ stroke: color, strokeOpacity: 0.25, strokeWidth: 1.5 }}
          />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={`url(#${sid})`}
            strokeWidth={2.75}
            fill={`url(#${gid})`}
            dot={false}
            activeDot={{ r: 5, fill: color, stroke: '#fff', strokeWidth: 2 }}
            animationDuration={750}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
