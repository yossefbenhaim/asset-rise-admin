// One badge for every operational status across the admin (reports, jobs,
// payments, sources, leads, log severity). Maps a status key → Pill kind +
// Hebrew label + a leading dot. Unknown keys fall back to neutral + raw text.
import { Pill } from './Pill'

type Kind = 'info' | 'success' | 'warning' | 'danger' | 'gold' | 'navy' | 'neutral'

const MAP: Record<string, { kind: Kind; label: string }> = {
  // report / pipeline run
  completed: { kind: 'success', label: 'הושלם' },
  processing: { kind: 'info', label: 'בעיבוד' },
  queued: { kind: 'neutral', label: 'בתור' },
  pending: { kind: 'warning', label: 'ממתין' },
  running: { kind: 'info', label: 'רץ' },
  done: { kind: 'success', label: 'הושלם' },
  failed: { kind: 'danger', label: 'נכשל' },
  draft: { kind: 'neutral', label: 'טיוטה' },
  // payments
  paid: { kind: 'success', label: 'שולם' },
  refunded: { kind: 'gold', label: 'הוחזר' },
  // sources / health
  active: { kind: 'success', label: 'פעיל' },
  degraded: { kind: 'warning', label: 'איטי' },
  down: { kind: 'danger', label: 'מושבת' },
  // leads
  new: { kind: 'info', label: 'חדש' },
  hot: { kind: 'danger', label: 'חם' },
  contacted: { kind: 'warning', label: 'חזרתי אליו' },
  qualified: { kind: 'gold', label: 'מתאים' },
  converted: { kind: 'success', label: 'שילם' },
  lost: { kind: 'neutral', label: 'לא רלוונטי' },
  // log severity
  error: { kind: 'danger', label: 'שגיאה' },
  warning: { kind: 'warning', label: 'אזהרה' },
  warn: { kind: 'warning', label: 'אזהרה' },
  info: { kind: 'info', label: 'מידע' },
}

const DOT: Record<Kind, string> = {
  success: 'bg-sc-success',
  info: 'bg-sc-primary',
  warning: 'bg-sc-warning',
  danger: 'bg-sc-danger',
  gold: 'bg-sc-gold',
  navy: 'bg-sc-navy',
  neutral: 'bg-sc-text-muted',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const m = MAP[status] ?? { kind: 'neutral' as Kind, label: label ?? status }
  return (
    <Pill kind={m.kind}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${DOT[m.kind]}`} />
      {label ?? m.label}
    </Pill>
  )
}
