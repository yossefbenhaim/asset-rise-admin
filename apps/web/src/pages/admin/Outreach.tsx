// Outreach Center — מרכז המכירות היוצאות. The 100-target B2B list (organizers /
// developers / tenant-lawyers) as a working pipeline: who they are, editable
// contact details, a per-target editable outreach draft, statuses, follow-up
// dates, and the day-45 discovery-gate pace. A host cron reminds Yossef via
// Telegram to keep the pace; this page is where he works the list.
import { useMemo, useState } from 'react'
import {
  PhoneCall, Users, CalendarClock, Target, Plus, ChevronDown, ChevronUp,
  Copy, ExternalLink, Save, Trash2,
} from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'

const STATUS_LABELS: Record<string, string> = {
  new: 'חדש',
  approached: 'נשלחה פנייה',
  call_scheduled: 'שיחה נקבעה',
  called: 'שיחה בוצעה',
  gave_addresses: 'נתן כתובות',
  pilot: 'פיילוט',
  customer: 'לקוח משלם',
  not_relevant: 'לא רלוונטי',
}
const TYPE_LABELS: Record<string, string> = {
  organizer: 'מארגנת',
  developer: 'יזם',
  lawyer: 'עו"ד',
  other: 'אחר',
}

type Target = {
  id: string; rank: number | null; name: string; type: string
  city_region: string | null; evidence: string | null; source_url: string | null
  phone: string | null; email: string | null; public_contact: string | null
  pitch_angle: string | null; suggested_deck: string | null; draft_message: string | null
  status: string; notes: string | null; next_followup_at: string | null
  last_contact_at: string | null
}

function Row({ t, onSaved }: { t: Target; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(t.draft_message ?? '')
  const [notes, setNotes] = useState(t.notes ?? '')
  const [phone, setPhone] = useState(t.phone ?? '')
  const [email, setEmail] = useState(t.email ?? '')
  const [copied, setCopied] = useState(false)
  const update = trpc.outreach.update.useMutation({ onSuccess: onSaved })
  const remove = trpc.outreach.remove.useMutation({ onSuccess: onSaved })

  const dirty = draft !== (t.draft_message ?? '') || notes !== (t.notes ?? '')
    || phone !== (t.phone ?? '') || email !== (t.email ?? '')

  const copyDraft = async () => {
    await navigator.clipboard.writeText(draft)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="border border-slate-700/60 rounded-xl mb-2 bg-slate-900/40">
      <div className="flex items-center gap-3 px-3 py-2 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <span className="text-slate-500 text-xs w-7">{t.rank ?? '—'}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{t.name}</div>
          <div className="text-xs text-slate-400 truncate">
            {TYPE_LABELS[t.type] ?? t.type}{t.city_region ? ` · ${t.city_region}` : ''}
          </div>
        </div>
        <select
          className="bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1"
          value={t.status}
          onClick={e => e.stopPropagation()}
          onChange={e => update.mutate({ id: t.id, patch: { status: e.target.value as never } })}
        >
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input
          type="date"
          className="bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1"
          title="פולו-אפ הבא"
          value={t.next_followup_at ? t.next_followup_at.slice(0, 10) : ''}
          onClick={e => e.stopPropagation()}
          onChange={e => update.mutate({ id: t.id, patch: { next_followup_at: e.target.value ? new Date(e.target.value).toISOString() : null } })}
        />
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-700/50 grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            {t.evidence && (
              <div className="text-sm">
                <div className="text-slate-400 text-xs mb-0.5">למה הם מטרה (מקורות ציבוריים)</div>
                <div className="text-slate-200">{t.evidence}</div>
              </div>
            )}
            {t.pitch_angle && (
              <div className="text-sm">
                <div className="text-slate-400 text-xs mb-0.5">זווית פתיחה</div>
                <div className="text-slate-200 italic">{t.pitch_angle}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-400">טלפון
                <input dir="ltr" className="mt-0.5 w-full bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1" value={phone} onChange={e => setPhone(e.target.value)} />
              </label>
              <label className="text-xs text-slate-400">אימייל
                <input dir="ltr" className="mt-0.5 w-full bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1" value={email} onChange={e => setEmail(e.target.value)} />
              </label>
            </div>
            {t.public_contact && <div className="text-xs text-slate-500">קשר מקורי: {t.public_contact}</div>}
            <div className="flex items-center gap-3 text-xs">
              {t.source_url && (
                <a href={t.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-400" onClick={e => e.stopPropagation()}>
                  <ExternalLink size={12} /> מקור
                </a>
              )}
              {t.suggested_deck && <span className="text-slate-500">מצגת: {t.suggested_deck}</span>}
              {t.last_contact_at && <span className="text-slate-500">מגע אחרון: {t.last_contact_at.slice(0, 10)}</span>}
            </div>
            <label className="text-xs text-slate-400 block">הערות
              <textarea className="mt-0.5 w-full bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1 min-h-[60px]" value={notes} onChange={e => setNotes(e.target.value)} />
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-slate-400 text-xs">טיוטת פנייה (ניתנת לעריכה)</div>
              <button className="inline-flex items-center gap-1 text-xs text-sky-400" onClick={copyDraft}>
                <Copy size={12} /> {copied ? 'הועתק!' : 'העתק'}
              </button>
            </div>
            <textarea
              className="w-full bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-2 min-h-[170px]"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="אין עדיין טיוטה — כתוב כאן או חכה ש-Coulson יכין"
            />
            <div className="flex items-center justify-between mt-2">
              <button
                className="inline-flex items-center gap-1 text-xs text-rose-400"
                onClick={() => { if (confirm(`למחוק את ${t.name}?`)) remove.mutate({ id: t.id }) }}
              >
                <Trash2 size={12} /> מחק
              </button>
              <button
                disabled={!dirty || update.isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm px-3 py-1.5"
                onClick={() => update.mutate({ id: t.id, patch: { draft_message: draft || null, notes: notes || null, phone: phone || null, email: email || null } })}
              >
                <Save size={14} /> {update.isLoading ? 'שומר…' : 'שמור שינויים'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', type: 'organizer', city_region: '', phone: '', email: '', evidence: '', source_url: '' })
  const create = trpc.outreach.create.useMutation({ onSuccess: () => { setForm({ name: '', type: 'organizer', city_region: '', phone: '', email: '', evidence: '', source_url: '' }); setOpen(false); onDone() } })
  if (!open) {
    return (
      <button className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 text-white text-sm px-3 py-1.5" onClick={() => setOpen(true)}>
        <Plus size={14} /> הוסף איש קשר
      </button>
    )
  }
  return (
    <div className="border border-slate-700 rounded-xl p-3 bg-slate-900/60 grid gap-2 md:grid-cols-3 w-full">
      <input className="bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1" placeholder="שם (חובה)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      <select className="bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
        {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input className="bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1" placeholder="עיר/אזור" value={form.city_region} onChange={e => setForm(f => ({ ...f, city_region: e.target.value }))} />
      <input dir="ltr" className="bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1" placeholder="טלפון" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      <input dir="ltr" className="bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1" placeholder="אימייל" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
      <input dir="ltr" className="bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1" placeholder="קישור מקור" value={form.source_url} onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))} />
      <textarea className="md:col-span-3 bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1" placeholder="למה הם מטרה (ראיות ממקורות ציבוריים)" value={form.evidence} onChange={e => setForm(f => ({ ...f, evidence: e.target.value }))} />
      <div className="md:col-span-3 flex gap-2 justify-end">
        <button className="text-sm text-slate-400 px-3 py-1.5" onClick={() => setOpen(false)}>ביטול</button>
        <button
          disabled={form.name.trim().length < 2 || create.isLoading}
          className="rounded-lg bg-sky-600 disabled:bg-slate-700 text-white text-sm px-3 py-1.5"
          onClick={() => create.mutate({
            name: form.name.trim(), type: form.type as never,
            city_region: form.city_region || undefined, phone: form.phone || undefined,
            email: form.email || undefined, evidence: form.evidence || undefined,
            source_url: form.source_url || undefined,
          })}
        >
          {create.isLoading ? 'מוסיף…' : 'הוסף'}
        </button>
      </div>
    </div>
  )
}

export default function AdminOutreach() {
  const [status, setStatus] = useState<string>('')
  const [type, setType] = useState<string>('')
  const [q, setQ] = useState('')

  const utils = trpc.useUtils()
  const refetch = () => { utils.outreach.list.invalidate(); utils.outreach.stats.invalidate() }
  const stats = trpc.outreach.stats.useQuery(undefined, { refetchOnWindowFocus: false })
  const list = trpc.outreach.list.useQuery(
    { status: (status || undefined) as never, type: (type || undefined) as never, q: q || undefined, limit: 300 },
    { refetchOnWindowFocus: false, keepPreviousData: true },
  )

  const s = stats.data
  const rows = useMemo(() => list.data ?? [], [list.data])

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>מרכז מכירות · Outreach</h1>
          <div className="sub">רשימת המטרות מהמחקר + מי שתוסיף · טיוטה לכל אחד · מעקב לשער יום-45 (10 שיחות)</div>
        </div>
        <AddForm onDone={refetch} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="שיחות בוצעו (יעד 10)" value={`${s?.callsDone ?? 0}/10`} icon={<PhoneCall size={18} />} tone={(s?.callsDone ?? 0) >= 10 ? 'success' : 'gold'} index={0} />
        <KpiCard label="ימים בשער 45" value={s?.gateStart ? `${s.daysElapsed}/45` : 'טרם התחיל'} icon={<Target size={18} />} tone={(s?.daysElapsed ?? 0) > 35 ? 'danger' : 'primary'} index={1} />
        <KpiCard label="פולו-אפים שהגיע זמנם" value={s?.followupsDue ?? 0} icon={<CalendarClock size={18} />} tone={(s?.followupsDue ?? 0) > 0 ? 'danger' : 'success'} index={2} />
        <KpiCard label="סה״כ מטרות" value={s?.total ?? 0} icon={<Users size={18} />} tone="primary" index={3} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          className="bg-slate-800 border border-slate-600 rounded-lg text-sm px-3 py-1.5 w-56"
          placeholder="חיפוש שם / עיר…"
          value={q} onChange={e => setQ(e.target.value)}
        />
        <select className="bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1.5" value={type} onChange={e => setType(e.target.value)}>
          <option value="">כל הסוגים</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="bg-slate-800 border border-slate-600 rounded-lg text-sm px-2 py-1.5" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="text-xs text-slate-500">{rows.length} ברשימה</span>
      </div>

      {list.isLoading ? (
        <div className="text-slate-400 text-sm py-8 text-center">טוען…</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-400 text-sm py-8 text-center">אין מטרות בסינון הזה</div>
      ) : (
        <div>{rows.map(t => <Row key={t.id} t={t as Target} onSaved={refetch} />)}</div>
      )}
    </div>
  )
}
