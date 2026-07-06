// Outreach Center — מרכז המכירות. The B2B target list (organizers / developers /
// tenant-lawyers) as a working pipeline, in the house design system: KPI pace
// header (day-45 gate), DataTable of targets, row-click → Drawer editor
// (contact / draft / notes / status / follow-up), Modal to add a person.
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  PhoneCall,
  Users as UsersIcon,
  CalendarClock,
  Target as TargetIcon,
  Plus,
  Copy,
  ExternalLink,
  Trash2,
} from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { DataTable } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { useToast } from '@/components/ui/Toast'

const STATUS_LABEL: Record<string, string> = {
  new: 'חדש',
  approached: 'נשלחה פנייה',
  call_scheduled: 'שיחה נקבעה',
  called: 'שיחה בוצעה',
  gave_addresses: 'נתן כתובות',
  pilot: 'פיילוט',
  customer: 'לקוח משלם',
  not_relevant: 'לא רלוונטי',
}
const STATUS_PILL: Record<string, 'info' | 'warning' | 'success' | 'gold' | 'neutral' | 'danger'> =
  {
    new: 'warning',
    approached: 'info',
    call_scheduled: 'info',
    called: 'gold',
    gave_addresses: 'gold',
    pilot: 'success',
    customer: 'success',
    not_relevant: 'neutral',
  }
const TYPE_LABEL: Record<string, string> = {
  organizer: 'מארגנת',
  developer: 'יזם',
  lawyer: 'עו"ד',
  other: 'אחר',
}
const TYPE_PILL: Record<string, 'gold' | 'info' | 'navy' | 'neutral'> = {
  organizer: 'gold',
  developer: 'info',
  lawyer: 'navy',
  other: 'neutral',
}

type Target = {
  id: string
  rank: number | null
  name: string
  type: string
  city_region: string | null
  evidence: string | null
  source_url: string | null
  phone: string | null
  email: string | null
  public_contact: string | null
  pitch_angle: string | null
  suggested_deck: string | null
  draft_message: string | null
  status: string
  notes: string | null
  next_followup_at: string | null
  last_contact_at: string | null
  created_at: string
  updated_at: string
}

function TargetDrawer({
  target,
  onClose,
  onSaved,
}: {
  target: Target | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [notes, setNotes] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [loadedId, setLoadedId] = useState<string | null>(null)

  // sync local edit state when a new target opens
  if (target && target.id !== loadedId) {
    setLoadedId(target.id)
    setDraft(target.draft_message ?? '')
    setNotes(target.notes ?? '')
    setPhone(target.phone ?? '')
    setEmail(target.email ?? '')
  }

  const update = trpc.outreach.update.useMutation({
    onSuccess: () => {
      toast.show('נשמר')
      onSaved()
    },
    onError: e => toast.show(e.message || 'שמירה נכשלה'),
  })
  const remove = trpc.outreach.remove.useMutation({
    onSuccess: () => {
      toast.show('נמחק')
      onSaved()
      onClose()
    },
    onError: e => toast.show(e.message || 'מחיקה נכשלה'),
  })
  if (!target) return <Drawer open={false} onClose={onClose} />

  const t = target
  const dirty =
    draft !== (t.draft_message ?? '') ||
    notes !== (t.notes ?? '') ||
    phone !== (t.phone ?? '') ||
    email !== (t.email ?? '')

  const copyDraft = async () => {
    await navigator.clipboard.writeText(draft)
    toast.show('הטיוטה הועתקה')
  }

  return (
    <Drawer open onClose={onClose} title={t.name} width={560}>
      <div className="p-4 space-y-4 overflow-y-auto">
        <div className="flex items-center gap-2 flex-wrap">
          <Pill kind={TYPE_PILL[t.type] ?? 'neutral'}>{TYPE_LABEL[t.type] ?? t.type}</Pill>
          {t.city_region && (
            <span className="text-[12px] text-sc-text-secondary">{t.city_region}</span>
          )}
          {t.source_url && (
            <a
              href={t.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-sc-primary"
            >
              <ExternalLink size={12} /> מקור
            </a>
          )}
        </div>

        {t.evidence && (
          <div>
            <div className="text-[12px] font-bold text-sc-text-secondary mb-1">למה הם מטרה</div>
            <div className="text-[13px] text-sc-text leading-relaxed">{t.evidence}</div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-[12px] font-bold text-sc-text-secondary">
            סטטוס
            <select
              className="mt-1 w-full bg-sc-bg border border-sc-border rounded-sc-input px-2 py-2 text-[13px] text-sc-text"
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
            פולו-אפ הבא
            <input
              type="date"
              className="mt-1 w-full bg-sc-bg border border-sc-border rounded-sc-input px-2 py-2 text-[13px] text-sc-text"
              value={t.next_followup_at ? t.next_followup_at.slice(0, 10) : ''}
              onChange={e =>
                update.mutate({
                  id: t.id,
                  patch: {
                    next_followup_at: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  },
                })
              }
            />
          </label>
          <label className="text-[12px] font-bold text-sc-text-secondary">
            טלפון
            <input
              dir="ltr"
              className="mt-1 w-full bg-sc-bg border border-sc-border rounded-sc-input px-2 py-2 text-[13px] text-sc-text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </label>
          <label className="text-[12px] font-bold text-sc-text-secondary">
            אימייל
            <input
              dir="ltr"
              className="mt-1 w-full bg-sc-bg border border-sc-border rounded-sc-input px-2 py-2 text-[13px] text-sc-text"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </label>
        </div>
        {t.public_contact && (
          <div className="text-[12px] text-sc-text-muted">קשר מקורי: {t.public_contact}</div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[12px] font-bold text-sc-text-secondary">
              טיוטת פנייה (ניתנת לעריכה)
            </div>
            <button
              className="inline-flex items-center gap-1 text-[12px] text-sc-primary"
              onClick={copyDraft}
            >
              <Copy size={12} /> העתק
            </button>
          </div>
          <textarea
            className="w-full bg-sc-bg border border-sc-border rounded-sc-input px-3 py-2 text-[13px] text-sc-text min-h-[170px] leading-relaxed"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="אין עדיין טיוטה — כתוב כאן"
          />
          {t.suggested_deck && (
            <div className="text-[12px] text-sc-text-muted mt-1">
              מצגת מוצעת: {t.suggested_deck}
            </div>
          )}
        </div>

        <label className="text-[12px] font-bold text-sc-text-secondary block">
          הערות
          <textarea
            className="mt-1 w-full bg-sc-bg border border-sc-border rounded-sc-input px-3 py-2 text-[13px] text-sc-text min-h-[70px]"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>

        <div className="flex items-center justify-between pt-2 border-t border-sc-border">
          <button
            className="inline-flex items-center gap-1 text-[12px] text-sc-danger"
            onClick={() => {
              if (confirm(`למחוק את ${t.name}?`)) remove.mutate({ id: t.id })
            }}
          >
            <Trash2 size={13} /> מחק מהרשימה
          </button>
          <Button
            disabled={!dirty || update.isLoading}
            onClick={() =>
              update.mutate({
                id: t.id,
                patch: {
                  draft_message: draft || null,
                  notes: notes || null,
                  phone: phone || null,
                  email: email || null,
                },
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
  const empty = {
    name: '',
    type: 'organizer',
    city_region: '',
    phone: '',
    email: '',
    evidence: '',
    source_url: '',
  }
  const [form, setForm] = useState(empty)
  const create = trpc.outreach.create.useMutation({
    onSuccess: () => {
      toast.show('נוסף לרשימה')
      setForm(empty)
      onClose()
      onDone()
    },
    onError: e =>
      toast.show(
        e.message?.includes('duplicate') ? 'שם כזה כבר קיים ברשימה' : e.message || 'הוספה נכשלה',
      ),
  })
  const inp =
    'w-full bg-sc-bg border border-sc-border rounded-sc-input px-3 py-2 text-[13px] text-sc-text'
  return (
    <Modal open={open} onClose={onClose} title="הוספת איש קשר">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-[12px] font-bold text-sc-text-secondary md:col-span-2">
          שם (חובה)
          <input
            className={`mt-1 ${inp}`}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary">
          סוג
          <select
            className={`mt-1 ${inp}`}
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
          >
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary">
          עיר / אזור
          <input
            className={`mt-1 ${inp}`}
            value={form.city_region}
            onChange={e => setForm(f => ({ ...f, city_region: e.target.value }))}
          />
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary">
          טלפון
          <input
            dir="ltr"
            className={`mt-1 ${inp}`}
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
          />
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary">
          אימייל
          <input
            dir="ltr"
            className={`mt-1 ${inp}`}
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          />
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary md:col-span-2">
          קישור מקור
          <input
            dir="ltr"
            className={`mt-1 ${inp}`}
            value={form.source_url}
            onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
          />
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary md:col-span-2">
          למה הם מטרה
          <textarea
            className={`mt-1 ${inp} min-h-[70px]`}
            value={form.evidence}
            onChange={e => setForm(f => ({ ...f, evidence: e.target.value }))}
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>
          ביטול
        </Button>
        <Button
          disabled={form.name.trim().length < 2 || create.isLoading}
          onClick={() =>
            create.mutate({
              name: form.name.trim(),
              type: form.type as never,
              city_region: form.city_region || undefined,
              phone: form.phone || undefined,
              email: form.email || undefined,
              evidence: form.evidence || undefined,
              source_url: form.source_url || undefined,
            })
          }
        >
          {create.isLoading ? 'מוסיף…' : 'הוסף'}
        </Button>
      </div>
    </Modal>
  )
}

export default function AdminOutreach() {
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [active, setActive] = useState<Target | null>(null)
  const [adding, setAdding] = useState(false)

  const utils = trpc.useUtils()
  const refetch = () => {
    utils.outreach.list.invalidate()
    utils.outreach.stats.invalidate()
  }
  const stats = trpc.outreach.stats.useQuery(undefined, { refetchOnWindowFocus: false })
  const list = trpc.outreach.list.useQuery(
    {
      type: (typeFilter || undefined) as never,
      status: (statusFilter || undefined) as never,
      limit: 300,
    },
    { refetchOnWindowFocus: false, keepPreviousData: true },
  )
  const s = stats.data
  const rows = useMemo(() => (list.data ?? []) as Target[], [list.data])

  // keep the drawer's target fresh after saves
  const activeRow = active ? (rows.find(r => r.id === active.id) ?? active) : null

  const columns: ColumnDef<Target, unknown>[] = [
    {
      accessorKey: 'rank',
      header: '#',
      cell: c => <span className="text-sc-text-muted">{(c.getValue() as number) ?? '—'}</span>,
      size: 40,
    },
    {
      accessorKey: 'name',
      header: 'שם',
      cell: c => (
        <div>
          <div className="font-bold text-sc-text">{c.row.original.name}</div>
          {c.row.original.city_region && (
            <div className="text-[11px] text-sc-text-muted truncate max-w-[220px]">
              {c.row.original.city_region}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: 'סוג',
      cell: c => (
        <Pill kind={TYPE_PILL[c.getValue() as string] ?? 'neutral'}>
          {TYPE_LABEL[c.getValue() as string] ?? String(c.getValue())}
        </Pill>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'טלפון',
      cell: c => (
        <span dir="ltr" className="text-[12px]">
          {(c.getValue() as string) ?? '—'}
        </span>
      ),
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
      accessorKey: 'next_followup_at',
      header: 'פולו-אפ',
      cell: c => {
        const v = c.getValue() as string | null
        if (!v) return <span className="text-sc-text-muted">—</span>
        const due = v <= new Date().toISOString()
        return (
          <span
            className={`text-[12px] ${due ? 'text-sc-danger font-bold' : 'text-sc-text-secondary'}`}
          >
            {v.slice(0, 10)}
          </span>
        )
      },
    },
    {
      accessorKey: 'draft_message',
      header: 'טיוטה',
      cell: c =>
        c.getValue() ? <Pill kind="success">מוכנה</Pill> : <Pill kind="neutral">אין</Pill>,
    },
  ]

  const filterBtn = (label: string, val: string, cur: string, set: (v: string) => void) => (
    <button
      key={val || 'all'}
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
          <h1>מרכז מכירות · Outreach</h1>
          <div className="sub">
            רשימת המטרות מהמחקר + מי שתוסיף · טיוטה לכל אחד · מעקב שער יום-45
          </div>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={15} /> הוסף איש קשר
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label="שיחות בוצעו (יעד 10)"
          value={`${s?.callsDone ?? 0}/10`}
          icon={<PhoneCall size={18} />}
          tone={(s?.callsDone ?? 0) >= 10 ? 'success' : 'gold'}
          index={0}
        />
        <KpiCard
          label="ימים בשער 45"
          value={s?.gateStart ? `${s.daysElapsed}/45` : 'טרם התחיל'}
          icon={<TargetIcon size={18} />}
          tone={(s?.daysElapsed ?? 0) > 35 ? 'danger' : 'primary'}
          index={1}
        />
        <KpiCard
          label="פולו-אפים שהגיע זמנם"
          value={s?.followupsDue ?? 0}
          icon={<CalendarClock size={18} />}
          tone={(s?.followupsDue ?? 0) > 0 ? 'danger' : 'success'}
          index={2}
        />
        <KpiCard
          label="סה״כ מטרות"
          value={s?.total ?? 0}
          icon={<UsersIcon size={18} />}
          tone="primary"
          index={3}
        />
      </div>

      <DataTable<Target>
        columns={columns}
        data={rows}
        loading={list.isLoading}
        onRowClick={r => setActive(r)}
        searchPlaceholder="חיפוש שם / עיר…"
        csvName="outreach-targets"
        pageSize={25}
        emptyTitle="אין מטרות בסינון הזה"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            {filterBtn('הכל', '', typeFilter, setTypeFilter)}
            {Object.entries(TYPE_LABEL).map(([v, l]) => filterBtn(l, v, typeFilter, setTypeFilter))}
            <span className="w-px h-5 bg-sc-border mx-1" />
            {filterBtn('כל הסטטוסים', '', statusFilter, setStatusFilter)}
            {['new', 'approached', 'called', 'pilot', 'customer'].map(v =>
              filterBtn(STATUS_LABEL[v], v, statusFilter, setStatusFilter),
            )}
          </div>
        }
      />

      <TargetDrawer target={activeRow} onClose={() => setActive(null)} onSaved={refetch} />
      <AddModal open={adding} onClose={() => setAdding(false)} onDone={refetch} />
    </div>
  )
}
