// Shared chart theming so every Recharts card reads on-brand in light AND dark.
// Axis ticks / grid use --sc-* CSS vars (valid in SVG fill/stroke); series use
// fixed brand hexes. A token-styled tooltip replaces Recharts' white default.
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

export const BRAND = {
  navy: '#1e3a5f',
  primary: '#3b6b9c',
  primaryLight: '#5a8db8',
  gold: '#a6895f',
  teal: '#4db6c4',
  danger: '#b94a48',
  success: '#4a8c5c',
}
// Donut / category palette (brand-coherent).
export const PALETTE = ['#1e3a5f', '#3b6b9c', '#5a8db8', '#4db6c4', '#a6895f', '#8fb3d4']

export const axisProps = {
  tick: { fill: 'var(--sc-text-muted)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--sc-border)' },
} as const
export const gridStroke = 'var(--sc-border)'

export function ChartTooltip({ active, payload, label, valueFmt }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="sc-card !shadow-sc-lg px-3 py-2 text-[12px]">
      {label != null && <div className="font-bold text-sc-text mb-1">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sc-text-secondary">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span>{p.name}:</span>
          <span className="font-bold text-sc-text sc-num">
            {valueFmt ? valueFmt(p.value) : p.value?.toLocaleString('he-IL')}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ChartCard({
  title,
  sub,
  action,
  children,
  index = 0,
}: {
  title: string
  sub?: string
  action?: ReactNode
  children: ReactNode
  index?: number
}) {
  return (
    <motion.div
      className="sc-glass p-4 flex flex-col"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[14px] font-bold text-sc-text m-0">{title}</h3>
          {sub && <p className="text-[11.5px] text-sc-text-muted m-0 mt-0.5">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="flex-1 min-h-[200px]">{children}</div>
    </motion.div>
  )
}
