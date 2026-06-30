import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ChartCard, ChartTooltip, PALETTE } from './chartTheme'

export function DonutChartCard({
  title, sub, data, nameKey = 'name', valueKey = 'value', height = 240, index = 0,
}: {
  title: string; sub?: string; data: any[]; nameKey?: string; valueKey?: string; height?: number; index?: number
}) {
  return (
    <ChartCard title={title} sub={sub} index={index}>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none">
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span className="text-sc-text-secondary">{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
