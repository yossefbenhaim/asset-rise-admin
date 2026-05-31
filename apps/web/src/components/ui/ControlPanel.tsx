import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Card, CardBody } from './Card'

// ControlPanel — the visually-distinct container that wraps every god-mode
// surface so the operator always knows they're in the dangerous tier.
// Design-tokens only; RTL-safe via inline-start border (border-s-*).
type Tone = 'danger' | 'navy'

const toneCls: Record<Tone, { border: string; header: string }> = {
  danger: { border: 'border-s-4 border-sc-danger', header: 'text-sc-danger' },
  navy:   { border: 'border-s-4 border-sc-navy',   header: 'text-sc-navy' },
}

export function ControlPanel({
  title,
  description,
  tone = 'danger',
  children,
}: {
  title: string
  description?: string
  tone?: Tone
  children: ReactNode
}) {
  const t = toneCls[tone]
  return (
    <Card className={t.border}>
      <div className="flex items-start gap-2 px-5 pt-5 pb-3">
        <AlertTriangle size={18} className={`${t.header} mt-0.5 shrink-0`} />
        <div>
          <h3 className={`text-[16px] font-bold m-0 ${t.header}`}>{title}</h3>
          {description && (
            <p className="text-[12px] text-sc-text-secondary m-0 mt-1">{description}</p>
          )}
        </div>
      </div>
      <CardBody className="pt-0">{children}</CardBody>
    </Card>
  )
}
