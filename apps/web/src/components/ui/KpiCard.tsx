// KPI card for the dashboard: label, big animated value, optional delta vs the
// previous period, optional sparkline, tinted icon. Glass surface + framer-motion
// entrance. Numeric values count up; string values render as-is.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

type Tone = 'primary' | 'gold' | 'teal' | 'navy' | 'success' | 'danger'
const TONE: Record<Tone, string> = {
  primary: 'bg-sc-primary/12 text-sc-primary',
  gold: 'bg-sc-gold/12 text-sc-gold',
  teal: 'bg-sc-teal/15 text-sc-teal',
  navy: 'bg-sc-navy/10 text-sc-navy',
  success: 'bg-sc-success-bg text-sc-success',
  danger: 'bg-sc-danger-bg text-sc-danger',
}

function useCountUp(target: number, ms = 700): number {
  const [v, setV] = useState(0)
  const ref = useRef<number>()
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setV(target)
      return
    }
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) ref.current = requestAnimationFrame(tick)
    }
    ref.current = requestAnimationFrame(tick)
    return () => {
      if (ref.current) cancelAnimationFrame(ref.current)
    }
  }, [target, ms])
  return v
}

export function KpiCard({
  label,
  value,
  format,
  delta,
  icon,
  tone = 'primary',
  sparkline,
  index = 0,
}: {
  label: string
  value: number | string
  format?: (n: number) => string
  delta?: number | null // % change vs previous period
  icon?: ReactNode
  tone?: Tone
  sparkline?: ReactNode
  index?: number
}) {
  const isNum = typeof value === 'number'
  const counted = useCountUp(isNum ? value : 0)
  const display = isNum ? (format ? format(counted) : counted.toLocaleString('he-IL')) : value
  const up = (delta ?? 0) >= 0

  return (
    <motion.div
      className="sc-glass p-4 flex flex-col gap-2 relative overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-start justify-between">
        <span className="text-[12px] font-semibold text-sc-text-secondary">{label}</span>
        {icon && (
          <span className={`grid place-items-center w-9 h-9 rounded-sc-input ${TONE[tone]}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="text-[26px] font-extrabold text-sc-text leading-none sc-num">{display}</div>
      <div className="flex items-center justify-between min-h-[18px]">
        {delta != null ? (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-sc-success' : 'text-sc-danger'}`}
          >
            {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        ) : (
          <span />
        )}
        {sparkline && <div className="h-7 w-24">{sparkline}</div>}
      </div>
    </motion.div>
  )
}
