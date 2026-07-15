// מרכז פיתוח — Dev Factory board. Jira-style Kanban where the pipeline stages
// ARE the agent team: Jarvis (spec) → Vision (dev) → Hawkeye (QA) → Shield
// (security) → ready-to-deploy → live. Cards carry a rich agent brief
// (context); agents post questions that pause the task until Yossef answers
// in the drawer. Driven on the host by ~/dev-factory-worker.sh.
import { useMemo, useState } from 'react'
import {
  ListChecks,
  Rocket,
  Hourglass,
  MessageCircleQuestion,
  Plus,
  Bot,
  User,
  Eye,
} from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { TaskDrawer } from '@/features/devtasks/TaskDrawer'
import { AddTaskModal } from '@/features/devtasks/AddTaskModal'
import {
  STAGE_COLUMNS,
  STATUS_LABEL,
  STATUS_PILL,
  stageProgress,
  isWorking,
  devRounds,
  type DevTaskRow,
  type DevTaskQuestionRow,
} from '@/features/devtasks/meta'

function TaskCard({
  t,
  openQuestions,
  onClick,
}: {
  t: DevTaskRow
  openQuestions: number
  onClick: () => void
}) {
  const prog = stageProgress(t.status)
  const working = isWorking(t.status)
  const rounds = devRounds(t.work_log)
  return (
    <button
      onClick={onClick}
      className="w-full text-start bg-sc-card border border-sc-border rounded-xl p-3 hover:border-sc-primary transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono text-sc-text-muted">#{t.seq}</span>
        {openQuestions > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sc-warning">
            <MessageCircleQuestion size={12} /> {openQuestions}
          </span>
        )}
      </div>
      <div className="text-[13px] font-bold text-sc-text leading-snug mt-1">{t.title}</div>

      {/* Stage progress — animated shimmer while an agent is on it. */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] text-sc-text-muted mb-1">
          <span className="inline-flex items-center gap-1">
            {working && <span className="dpf-livedot w-1.5 h-1.5 rounded-full bg-sc-gold" />}
            {working ? `${STATUS_LABEL[t.status]} · עובד…` : STATUS_LABEL[t.status]}
          </span>
          <span className="font-mono">
            {prog.step}/{prog.total}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-sc-bg overflow-hidden">
          <div
            className={`h-full rounded-full ${working ? 'dpf-bar__fill--working' : 'bg-sc-primary'}`}
            style={{ width: `${prog.pct}%`, transition: 'width 0.6s ease' }}
          />
        </div>
      </div>

      <div className="flex items-center gap-1 mt-2 text-[11px] text-sc-text-secondary">
        {t.agent === 'Yossef' ? <User size={11} /> : <Bot size={11} />}
        {t.agent}
        {rounds > 1 && (
          <span
            className="text-sc-warning font-bold"
            title={`חזר לפיתוח ${rounds} פעמים אחרי בדיקות`}
          >
            · סבב {rounds}
          </span>
        )}
        {t.status === 'review' && t.preview_url && (
          <span className="ms-auto inline-flex items-center gap-1 text-sc-gold font-bold">
            <Eye size={11} /> תצוגה מוכנה
          </span>
        )}
      </div>
    </button>
  )
}

export default function AdminDevTasks() {
  const [active, setActive] = useState<DevTaskRow | null>(null)
  const [adding, setAdding] = useState(false)

  const utils = trpc.useUtils()
  const refetch = () => {
    utils.devTasks.list.invalidate()
    utils.devTasks.stats.invalidate()
    utils.devTasks.questions.invalidate()
  }
  // Poll — the factory advances cards from the host, the board should breathe.
  const stats = trpc.devTasks.stats.useQuery(undefined, { refetchInterval: 15_000 })
  const list = trpc.devTasks.list.useQuery(undefined, {
    refetchInterval: 15_000,
    keepPreviousData: true,
  })
  const questionsQ = trpc.devTasks.questions.useQuery(undefined, { refetchInterval: 15_000 })

  const s = stats.data
  const rows = useMemo(() => (list.data ?? []) as DevTaskRow[], [list.data])
  const questions = useMemo(
    () => (questionsQ.data ?? []) as DevTaskQuestionRow[],
    [questionsQ.data],
  )
  const openQByTask = useMemo(() => {
    const m = new Map<string, number>()
    for (const q of questions)
      if (q.status === 'open') m.set(q.task_id, (m.get(q.task_id) ?? 0) + 1)
    return m
  }, [questions])

  const activeRow = active ? (rows.find(r => r.id === active.id) ?? active) : null
  const parked = rows.filter(r => r.status === 'waiting_yossef' || r.status === 'blocked')

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>מרכז פיתוח · Dev Factory</h1>
          <div className="sub">
            כל משימה עוברת את שרשרת הצוות: Jarvis (אפיון) ← Vision (פיתוח) ← Hawkeye (בדיקות) ←
            Shield (אבטחה) ← פריסה. סוכן ששואל שאלה — ענו לו כאן והוא ממשיך.
          </div>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={15} /> משימה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label="בעבודה בשרשרת"
          value={s?.working ?? 0}
          icon={<ListChecks size={18} />}
          tone="gold"
          index={0}
        />
        <KpiCard
          label="באוויר"
          value={s?.deployed ?? 0}
          icon={<Rocket size={18} />}
          tone="success"
          index={1}
        />
        <KpiCard
          label="שאלות פתוחות מסוכנים"
          value={s?.openQuestions ?? 0}
          icon={<MessageCircleQuestion size={18} />}
          tone={(s?.openQuestions ?? 0) > 0 ? 'danger' : 'success'}
          index={2}
        />
        <KpiCard
          label="ממתינות לך / חסומות"
          value={s?.waiting ?? 0}
          icon={<Hourglass size={18} />}
          tone={(s?.waiting ?? 0) > 0 ? 'danger' : 'primary'}
          index={3}
        />
      </div>

      {/* Kanban — one column per pipeline stage, agent name on the header. */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-[980px]">
          {STAGE_COLUMNS.map(col => {
            const colRows = rows.filter(r => r.status === col.key)
            return (
              <div
                key={col.key}
                className="flex-1 min-w-[150px] bg-sc-bg border border-sc-border rounded-xl p-2"
              >
                <div className="flex items-center justify-between px-1 pb-2">
                  <div className="text-[12.5px] font-extrabold text-sc-text">
                    {col.label}
                    {col.agent && (
                      <span className="block text-[10.5px] font-bold text-sc-primary">
                        <Bot size={10} className="inline -mt-0.5 me-0.5" />
                        {col.agent}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-sc-text-muted">{colRows.length}</span>
                </div>
                {/* Cap at ~5 cards, then scroll inside the column. */}
                <div className="space-y-2 min-h-[60px] max-h-[560px] overflow-y-auto pe-0.5">
                  {colRows.map(t => (
                    <TaskCard
                      key={t.id}
                      t={t}
                      openQuestions={openQByTask.get(t.id) ?? 0}
                      onClick={() => setActive(t)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Parked lane — waiting on Yossef or blocked. */}
      {parked.length > 0 && (
        <div className="mt-4">
          <div className="text-[13px] font-extrabold text-sc-text mb-2">
            ממתינות לך / חסומות ({parked.length})
          </div>
          <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
            {parked.map(t => (
              <div key={t.id} className="relative">
                <TaskCard
                  t={t}
                  openQuestions={openQByTask.get(t.id) ?? 0}
                  onClick={() => setActive(t)}
                />
                <div className="absolute top-2 left-2">
                  <Pill kind={STATUS_PILL[t.status]}>{STATUS_LABEL[t.status]}</Pill>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <TaskDrawer
        task={activeRow}
        questions={questions}
        onClose={() => setActive(null)}
        onSaved={refetch}
      />
      <AddTaskModal open={adding} onClose={() => setAdding(false)} onDone={refetch} />
    </div>
  )
}
