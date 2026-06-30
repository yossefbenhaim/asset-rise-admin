import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BRAND, ChartCard, ChartTooltip, axisProps, gridStroke } from './chartTheme'

export function BarChartCard({
  title, sub, data, xKey, yKey, color = BRAND.gold, height = 240, index = 0, valueFmt, horizontal = false,
}: {
  title: string; sub?: string; data: any[]; xKey: string; yKey: string
  color?: string; height?: number; index?: number; valueFmt?: (n: number) => string; horizontal?: boolean
}) {
  return (
    <ChartCard title={title} sub={sub} index={index}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 6, right: 6, left: horizontal ? 8 : -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
          {horizontal
            ? <><XAxis type="number" {...axisProps} allowDecimals={false} /><YAxis type="category" dataKey={xKey} {...axisProps} width={90} /></>
            : <><XAxis dataKey={xKey} {...axisProps} /><YAxis {...axisProps} width={40} allowDecimals={false} /></>}
          <Tooltip content={<ChartTooltip valueFmt={valueFmt} />} cursor={{ fill: color, fillOpacity: 0.08 }} />
          <Bar dataKey={yKey} fill={color} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={38} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
