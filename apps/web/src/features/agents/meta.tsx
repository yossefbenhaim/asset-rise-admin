// Shared vocabulary for the Agents Center: labels, pill tones, formatters and
// small building blocks used by both the overview page and per-agent pages.
import type { ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { ModelConfig } from '@/features/agents/ModelPicker'

export const TEAM_LABEL: Record<string, string> = {
  command: 'פיקוד',
  dev: 'פיתוח',
  growth: 'צמיחה ומכירות',
  marketing: 'שיווק',
  ops: 'תפעול',
  legal: 'משפטי',
  product: 'מוצר',
}
export const TEAM_PILL: Record<
  string,
  'navy' | 'info' | 'gold' | 'success' | 'warning' | 'neutral'
> = {
  command: 'navy',
  dev: 'info',
  growth: 'gold',
  marketing: 'warning',
  ops: 'success',
  legal: 'neutral',
  product: 'info',
}
export const STATUS_LABEL: Record<string, string> = {
  active: 'פעיל',
  'semi-active': 'פעיל חלקית',
  frozen: 'מוקפא',
  archived: 'בארכיון',
  worker: 'Worker',
}
export const STATUS_PILL: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'gold'> = {
  active: 'success',
  'semi-active': 'gold',
  frozen: 'info',
  archived: 'neutral',
  worker: 'success',
}
export const KIND_LABEL: Record<string, string> = {
  identity: 'זהות והגדרה',
  deliverable: 'תוצר',
  report: 'דוח',
  contract: 'חוזה',
  'legal-draft': 'טיוטה משפטית',
  card: 'כרטיס משימה',
  ledger: 'לדג׳ר',
  health: 'בריאות',
  doc: 'מסמך',
}
export const LEGAL_KINDS = new Set(['contract', 'legal-draft'])
export const KIND_PILL: Record<string, 'gold' | 'navy' | 'neutral'> = {
  contract: 'gold',
  'legal-draft': 'navy',
}
export const ACT_LABEL: Record<string, string> = {
  approval: 'בקשת אישור',
  decision: 'החלטה שלך',
  report: 'דוח',
  session: 'פעילות מודל',
  cron: 'ריצה מתוזמנת',
  health: 'בריאות',
}

export type AgentListRow = {
  id: string
  name: string
  emoji: string | null
  team: string
  role_title: string
  purpose: string | null
  guardrails: string | null
  model: string | null
  fallback_model: string | null
  status: string
  version: string | null
  version_why: string | null
  version_history: Array<{ version: string; date: string; note: string }>
  workspace: string | null
  telegram_bound: boolean
  key_files: string[]
  discrepancies: string[]
  sessions_count: number | null
  last_activity_at: string | null
  synced_at: string
  skills_count: number
  docs_count: number
  crons_count: number
  model_config: ModelConfig | null
  [key: string]: unknown
}

export const shortModel = (m: string | null) =>
  (m ?? '—').replace('openai-codex/', '').replace('codex/', '').replace('anthropic/', '')

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.valueOf())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const fmtBytes = (n: number | null) => {
  if (!n || n <= 0) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 text-[12px] font-extrabold text-sc-text-muted uppercase tracking-wide mb-2">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}

// Full-content viewer for a skill file / document — monospace, LTR (files are English).
export function ContentModal({
  title,
  path,
  content,
  loading,
  onClose,
}: {
  title: string
  path?: string | null
  content: string | null
  loading: boolean
  onClose: () => void
}) {
  return (
    <Modal open onClose={onClose} title={title} subtitle={path ?? undefined} size="xl">
      {loading ? (
        <div className="text-[13px] text-sc-text-secondary p-4">טוען…</div>
      ) : content ? (
        <pre
          dir="ltr"
          className="text-[12px] leading-relaxed whitespace-pre-wrap break-words bg-sc-bg rounded-lg p-4 max-h-[65vh] overflow-auto font-mono"
        >
          {content}
        </pre>
      ) : (
        <div className="text-[13px] text-sc-text-secondary p-4">
          אין תוכן שמור לקובץ זה (ייתכן שהוא גדול מדי או בינארי).
        </div>
      )}
    </Modal>
  )
}
