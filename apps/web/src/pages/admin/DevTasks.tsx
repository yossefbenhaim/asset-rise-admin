// Dev Tasks board (מרכז פיתוח) — the Redirectx gap-closing campaign: ordered
// tasks with campaign phase, owning agent and delivery status. KPI header,
// DataTable, row-click → Drawer editor, Modal to add a task.
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ListChecks, Rocket, Hourglass, Layers, Plus, Trash2 } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { DataTable } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { useToast } from '@/components/ui/Toast'

const STATUS_LABEL: Record<string, string> = {
  backlog: 'ממתין',
  spec: 'באפיון',
  in_dev: 'בפיתוח',
  review: 'בבדיקה',
  deployed: 'באוויר',
  blocked: 'חסום',
  waiting_yossef: 'ממתין ליוסף',
}
const STATUS_PILL: Record<string, 'info' | 'warning' | 'success' | 'gold' | 'neutral' | 'danger'> =
  {
    backlog: 'neutral',
    spec: 'info',
    in_dev: 'gold',
    review: 'warning',
    deployed: 'success',
    blocked: 'danger',
    waiting_yossef: 'warning',
  }
const PHASE_LABEL: Record<string, string> = {
  ops: 'תפעול',
  regulation: 'רגולציה',
  organizer: 'מנוע המארגן',
  comms: 'תקשורת',
  payments: 'תשלומים',
  collab: 'שיתוף ומקצוענים',
  quickwin: 'Quick Win',
}
const TYPE_LABEL: Record<string, string> = {
  dev: 'פיתוח בלבד',
  dev_external: 'פיתוח + גורם חוץ',
  human: 'פעולה אנושית',
}
const TYPE_PILL: Record<string, 'navy' | 'info' | 'gold'> = {
  dev: 'navy',
  dev_external: 'info',
  human: 'gold',
}
const AGENTS = ['Claude', 'Vision', 'Hawkeye', 'Murdock', 'Yossef']

type Task = {
  id: string
  seq: number
  title: string
  description: string | null
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

const inp =
  'mt-1 w-full bg-sc-bg border border-sc-border rounded-sc-input px-2 py-2 text-[13px] text-sc-text'

function TaskDrawer({
  task,
  onClose,
  onSaved,
}: {
  task: Task | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [notes, setNotes] = useState('')
  const [blockedReason, setBlockedReason] = useState('')
  const [loadedId, setLoadedId] = useState<string | null>(null)
  if (task && task.id !== loadedId) {
    setLoadedId(task.id)
    setNotes(task.notes ?? '')
    setBlockedReason(task.blocked_reason ?? '')
  }
  const update = trpc.devTasks.update.useMutation({
    onSuccess: () => {
      toast.show('נשמר')
      onSaved()
    },
    onError: e => toast.show(e.message || 'שמירה נכשלה'),
  })
  const remove = trpc.devTasks.remove.useMutation({
    onSuccess: () => {
      toast.show('נמחק')
      onSaved()
      onClose()
    },
    onError: e => toast.show(e.message || 'מחיקה נכשלה'),
  })
  if (!task) return <Drawer open={false} onClose={onClose} />
  const t = task
  const dirty = notes !== (t.notes ?? '') || blockedReason !== (t.blocked_reason ?? '')
  return (
    <Drawer open onClose={onClose} title={`#${t.seq} · ${t.title}`} width={560}>
      <div className="p-4 space-y-4 overflow-y-auto">
        <div className="flex items-center gap-2 flex-wrap">
          <Pill kind="neutral">{PHASE_LABEL[t.phase] ?? t.phase}</Pill>
          <Pill kind={TYPE_PILL[t.task_type] ?? 'navy'}>
            {TYPE_LABEL[t.task_type] ?? t.task_type}
          </Pill>
          {t.depends_on.length > 0 && (
            <span className="text-[12px] text-sc-text-muted">
              תלוי ב: {t.depends_on.map(n => `#${n}`).join(', ')}
            </span>
          )}
        </div>
        {t.description && (
          <div className="text-[13px] text-sc-text leading-relaxed">{t.description}</div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[12px] font-bold text-sc-text-secondary">
            סטטוס
            <select
              className={inp}
              value={t.status}
              onChange={e =>
                update.mutate({ id: t.id, patch: { status: e.target.value as never } })
              }
            >
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-bold text-sc-text-secondary">
            סוכן אחראי
            <select
              className={inp}
              value={t.agent}
              onChange={e => update.mutate({ id: t.id, patch: { agent: e.target.value } })}
            >
              {[...new Set([t.agent, ...AGENTS])].map(a => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="text-[12px] font-bold text-sc-text-secondary block">
          סיבת חסימה
          <input
            className={inp}
            value={blockedReason}
            onChange={e => setBlockedReason(e.target.value)}
            placeholder="רק אם המשימה חסומה"
          />
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary block">
          הערות
          <textarea
            className={`${inp} min-h-[90px]`}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>
        <div className="flex items-center justify-between pt-2 border-t border-sc-border">
          <button
            className="inline-flex items-center gap-1 text-[12px] text-sc-danger"
            onClick={() => {
              if (confirm(`למחוק את "${t.title}"?`)) remove.mutate({ id: t.id })
            }}
          >
            <Trash2 size={13} /> מחק משימה
          </button>
          <Button
            disabled={!dirty || update.isLoading}
            onClick={() =>
              update.mutate({
                id: t.id,
                patch: { notes: notes || null, blocked_reason: blockedReason || null },
              })
            }
          >
            {update.isLoading ? 'שומר…' : 'שמור שינויים'}
          </Button>
        </div>
      </div>
    </Drawer>
  )
}

function AddModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const empty = { title: '', description: '', phase: 'quickwin', task_type: 'dev', agent: 'Claude' }
  const [form, setForm] = useState(empty)
  const create = trpc.devTasks.create.useMutation({
    onSuccess: () => {
      toast.show('נוספה ללוח')
      setForm(empty)
      onClose()
      onDone()
    },
    onError: e => toast.show(e.message || 'הוספה נכשלה'),
  })
  return (
    <Modal open={open} onClose={onClose} title="משימה חדשה">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-[12px] font-bold text-sc-text-secondary md:col-span-2">
          כותרת (חובה)
          <input
            className={inp}
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary">
          שלב בקמפיין
          <select
            className={inp}
            value={form.phase}
            onChange={e => setForm(f => ({ ...f, phase: e.target.value }))}
          >
            {Object.entries(PHASE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary">
          סוג
          <select
            className={inp}
            value={form.task_type}
            onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))}
          >
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary">
          סוכן אחראי
          <select
            className={inp}
            value={form.agent}
            onChange={e => setForm(f => ({ ...f, agent: e.target.value }))}
          >
            {AGENTS.map(a => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary md:col-span-2">
          תיאור
          <textarea
            className={`${inp} min-h-[70px]`}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>
          ביטול
        </Button>
        <Button
          disabled={form.title.trim().length < 2 || create.isLoading}
          onClick={() =>
            create.mutate({
              title: form.title.trim(),
              description: form.description || undefined,
              phase: form.phase as never,
              task_type: form.task_type as never,
              agent: form.agent,
            })
          }
        >
          {create.isLoading ? 'מוסיף…' : 'הוסף'}
        </Button>
      </div>
    </Modal>
  )
}

export default function AdminDevTasks() {
  const [phaseFilter, setPhaseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [active, setActive] = useState<Task | null>(null)
  const [adding, setAdding] = useState(false)

  const utils = trpc.useUtils()
  const refetch = () => {
    utils.devTasks.list.invalidate()
    utils.devTasks.stats.invalidate()
  }
  const stats = trpc.devTasks.stats.useQuery(undefined, { refetchOnWindowFocus: false })
  const list = trpc.devTasks.list.useQuery(
    {
      phase: (phaseFilter || undefined) as never,
      status: (statusFilter || undefined) as never,
    },
    { refetchOnWindowFocus: false, keepPreviousData: true },
  )
  const s = stats.data
  const rows = useMemo(() => (list.data ?? []) as Task[], [list.data])
  const activeRow = active ? (rows.find(r => r.id === active.id) ?? active) : null

  const columns: ColumnDef<Task, unknown>[] = [
    {
      accessorKey: 'seq',
      header: '#',
      cell: c => <span className="text-sc-text-muted">{c.getValue() as number}</span>,
      size: 40,
    },
    {
      accessorKey: 'title',
      header: 'משימה',
      cell: c => (
        <div>
          <div className="font-bold text-sc-text">{c.row.original.title}</div>
          <div className="text-[11px] text-sc-text-muted">
            {PHASE_LABEL[c.row.original.phase] ?? c.row.original.phase}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'task_type',
      header: 'סוג',
      cell: c => (
        <Pill kind={TYPE_PILL[c.getValue() as string] ?? 'navy'}>
          {TYPE_LABEL[c.getValue() as string] ?? String(c.getValue())}
        </Pill>
      ),
    },
    {
      accessorKey: 'agent',
      header: 'סוכן',
      cell: c => <span className="text-[13px] font-bold">{c.getValue() as string}</span>,
    },
    {
      accessorKey: 'status',
      header: 'סטטוס',
      cell: c => (
        <Pill kind={STATUS_PILL[c.getValue() as string] ?? 'neutral'}>
          {STATUS_LABEL[c.getValue() as string] ?? String(c.getValue())}
        </Pill>
      ),
    },
    {
      accessorKey: 'updated_at',
      header: 'עדכון',
      cell: c => (
        <span className="text-[12px] text-sc-text-secondary" dir="ltr">
          {(c.getValue() as string).slice(0, 10)}
        </span>
      ),
    },
  ]

  const filterBtn = (label: string, val: string, cur: string, set: (v: string) => void) => (
    <button
      key={`${label}-${val || 'all'}`}
      onClick={() => set(val)}
      className={`px-3 py-1 rounded-sc-pill text-[12px] font-bold border ${cur === val ? 'bg-sc-primary text-white border-sc-primary' : 'bg-sc-card text-sc-text border-sc-border'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>מרכז פיתוח · Dev Tasks</h1>
          <div className="sub">קמפיין סגירת הפערים מול Redirectx — לפי סדר ביצוע, סוכן וסטטוס</div>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={15} /> משימה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label="בעבודה עכשיו"
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
          label="חסומות / ממתינות ליוסף"
          value={s?.waiting ?? 0}
          icon={<Hourglass size={18} />}
          tone={(s?.waiting ?? 0) > 0 ? 'danger' : 'success'}
          index={2}
        />
        <KpiCard
          label="סה״כ משימות"
          value={s?.total ?? 0}
          icon={<Layers size={18} />}
          tone="primary"
          index={3}
        />
      </div>

      <DataTable<Task>
        columns={columns}
        data={rows}
        loading={list.isLoading}
        onRowClick={r => setActive(r)}
        searchPlaceholder="חיפוש משימה…"
        csvName="dev-tasks"
        pageSize={30}
        emptyTitle="אין משימות בסינון הזה"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            {filterBtn('כל השלבים', '', phaseFilter, setPhaseFilter)}
            {Object.entries(PHASE_LABEL).map(([v, l]) =>
              filterBtn(l, v, phaseFilter, setPhaseFilter),
            )}
            <span className="w-px h-5 bg-sc-border mx-1" />
            {filterBtn('כל הסטטוסים', '', statusFilter, setStatusFilter)}
            {['in_dev', 'spec', 'deployed', 'waiting_yossef'].map(v =>
              filterBtn(STATUS_LABEL[v], v, statusFilter, setStatusFilter),
            )}
          </div>
        }
      />

      <TaskDrawer task={activeRow} onClose={() => setActive(null)} onSaved={refetch} />
      <AddModal open={adding} onClose={() => setAdding(false)} onDone={refetch} />
    </div>
  )
}
