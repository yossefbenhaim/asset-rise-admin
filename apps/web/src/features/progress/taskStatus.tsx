import { Pill } from '@/components/ui/Pill'

// Shared mapping for sc_project_tasks statuses → Hebrew label + Pill kind.
const MAP: Record<string, { label: string; kind: 'success' | 'info' | 'gold' | 'danger' | 'neutral' }> = {
  pending: { label: 'פתוח', kind: 'neutral' },
  open: { label: 'פתוח', kind: 'neutral' },
  in_progress: { label: 'בתהליך', kind: 'info' },
  awaiting_approval: { label: 'ממתין לאישור', kind: 'gold' },
  done: { label: 'הושלם', kind: 'success' },
  skipped: { label: 'דולג', kind: 'neutral' },
  blocked: { label: 'חסום', kind: 'danger' },
}

export function TaskStatusPill({ status }: { status: string | null }) {
  const m = (status && MAP[status]) || { label: status ?? '—', kind: 'neutral' as const }
  return <Pill kind={m.kind}>{m.label}</Pill>
}
