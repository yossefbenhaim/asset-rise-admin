import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BRAND, ChartCard, ChartTooltip, axisProps, gridStroke } from './chartTheme'

export function AreaChartCard({
  title, sub, data, xKey, yKey, color = BRAND.primary, height = 240, index = 0, valueFmt,
}: {
  title: string; sub?: string; data: any[]; xKey: string; yKey: string
  color?: string; height?: number; index?: number; valueFmt?: (n: number) => string
}) {
  const gid = `area-${yKey}`
  return (
    <ChartCard title={title} sub={sub} index={index}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 6, right: 6, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} width={40} allowDecimals={false} />
          <Tooltip content={<ChartTooltip valueFmt={valueFmt} />} cursor={{ stroke: color, strokeOpacity: 0.3 }} />
          <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={2.5} fill={`url(#${gid})`} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
