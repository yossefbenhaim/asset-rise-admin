import type { ReactNode } from 'react'

type Kind = 'info' | 'success' | 'warning' | 'danger' | 'gold' | 'navy' | 'neutral'

const kindCls: Record<Kind, string> = {
  info:    'bg-sc-light-blue text-sc-primary',
  success: 'bg-sc-success-bg text-sc-success',
  warning: 'bg-sc-warning-bg text-sc-warning',
  danger:  'bg-sc-danger-bg text-sc-danger',
  gold:    'bg-sc-cream text-sc-gold',
  navy:    'bg-sc-navy text-white',
  neutral: 'bg-sc-bg text-sc-text-secondary',
}

export function Pill({ kind = 'neutral', children }: { kind?: Kind; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-0.5 rounded-sc-pill text-[10px] font-bold ${kindCls[kind]}`}>
      {children}
    </span>
  )
}
