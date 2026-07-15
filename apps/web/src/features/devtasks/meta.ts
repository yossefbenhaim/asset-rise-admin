// Dev Factory board metadata — the pipeline stages ARE the agent team:
// Jarvis specs → Vision develops → Hawkeye tests → Shield security-reviews.
export const STAGE_COLUMNS = [
  { key: 'backlog', label: 'ממתין', agent: '' },
  { key: 'spec', label: 'אפיון', agent: 'Jarvis' },
  { key: 'in_dev', label: 'פיתוח', agent: 'Vision' },
  { key: 'qa', label: 'בדיקות', agent: 'Hawkeye' },
  { key: 'security', label: 'אבטחה', agent: 'Shield' },
  { key: 'review', label: 'בדיקה של יוסף', agent: 'Yossef' },
  { key: 'approved', label: 'אושר · במיזוג', agent: '' },
  { key: 'deployed', label: 'באוויר', agent: '' },
] as const

export const STATUS_LABEL: Record<string, string> = {
  backlog: 'ממתין',
  spec: 'באפיון · Jarvis',
  in_dev: 'בפיתוח · Vision',
  qa: 'בבדיקות · Hawkeye',
  security: 'באבטחה · Shield',
  review: 'בדיקה של יוסף',
  approved: 'אושר · במיזוג',
  deployed: 'באוויר',
  blocked: 'חסום',
  waiting_yossef: 'ממתין ליוסף',
}

export type PillKind = 'info' | 'warning' | 'success' | 'gold' | 'neutral' | 'danger' | 'navy'

export const STATUS_PILL: Record<string, PillKind> = {
  backlog: 'neutral',
  spec: 'info',
  in_dev: 'gold',
  qa: 'warning',
  security: 'navy',
  review: 'gold',
  approved: 'info',
  deployed: 'success',
  blocked: 'danger',
  waiting_yossef: 'warning',
}

export const PHASE_LABEL: Record<string, string> = {
  ops: 'תפעול',
  regulation: 'רגולציה',
  organizer: 'מנוע המארגן',
  comms: 'תקשורת',
  payments: 'תשלומים',
  collab: 'שיתוף ומקצוענים',
  quickwin: 'Quick Win',
}

export const TYPE_LABEL: Record<string, string> = {
  dev: 'פיתוח בלבד',
  dev_external: 'פיתוח + גורם חוץ',
  human: 'פעולה אנושית',
}

export const TYPE_PILL: Record<string, PillKind> = {
  dev: 'navy',
  dev_external: 'info',
  human: 'gold',
}

export interface DevTaskRow {
  id: string
  seq: number
  title: string
  description: string | null
  context: string | null
  branch: string | null
  work_log: string | null
  preview_url: string | null
  phase: string
  task_type: string
  agent: string
  status: string
  blocked_reason: string | null
  notes: string | null
  depends_on: number[]
  created_at: string
  updated_at: string
}

// Pipeline order for the progress bar. backlog=0%; each agent stage advances;
// deployed=100%. review sits near the end (waiting on Yossef).
const PROGRESS_ORDER = ['spec', 'in_dev', 'qa', 'security', 'review', 'approved', 'deployed']

export function stageProgress(status: string): { step: number; total: number; pct: number } {
  const total = PROGRESS_ORDER.length
  if (status === 'backlog') return { step: 0, total, pct: 4 }
  const i = PROGRESS_ORDER.indexOf(status)
  if (i < 0) return { step: 0, total, pct: 0 } // blocked / waiting_yossef
  return { step: i + 1, total, pct: Math.round(((i + 1) / total) * 100) }
}

// An agent is actively working this card while it sits in one of these stages.
const ACTIVE_STAGES = new Set(['spec', 'in_dev', 'qa', 'security'])
export function isWorking(status: string): boolean {
  return ACTIVE_STAGES.has(status)
}

// The worker stamps each stage report "[YYYY-MM-DD HH:MM] <agent> (<status>):".
// Counting the in_dev stamps ≈ how many dev rounds the card has survived, which
// is the "why is this still in dev?" signal the board otherwise hides.
export function devRounds(workLog: string | null): number {
  if (!workLog) return 0
  return (workLog.match(/\(in_dev\):/g) ?? []).length
}

export interface DevTaskQuestionRow {
  id: string
  task_id: string
  asked_by: string
  question: string
  answer: string | null
  status: string
  asked_at: string
  answered_at: string | null
}
