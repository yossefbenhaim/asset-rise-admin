// Cost Dashboard — עלויות. Every tool/service the business pays for: current
// monthly burn by category, planned items (PSP, WhatsApp, SMS...) and the
// launch-scenario forecast. House design system: KpiCard + Donut/Bar chart
// cards + DataTable + Drawer editor + Modal add-form.
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Wallet, TrendingUp, Rocket, AlertTriangle, Plus, ExternalLink, Trash2 } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { DataTable } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { useToast } from '@/components/ui/Toast'
import { DonutChartCard } from '@/components/charts/DonutChartCard'
import { BarChartCard } from '@/components/charts/BarChartCard'

const CAT_LABEL: Record<string, string> = {
  infra: 'תשתיות', ai: 'AI ומודלים', comms: 'תקשורת (SMS/WhatsApp/מייל)',
  payments: 'סליקה ותשלומים', marketing: 'שיווק', legal: 'משפטי/הנה"ח', other: 'אחר',
}
const STATUS_LABEL: Record<string, string> = { active: 'פעיל', planned: 'מתוכנן', cancelled: 'בוטל' }
const STATUS_PILL: Record<string, 'success' | 'info' | 'neutral'> = { active: 'success', planned: 'info', cancelled: 'neutral' }
const BILLING_LABEL: Record<string, string> = { monthly: 'חודשי', annual: 'שנתי', one_time: 'חד-פעמי', usage: 'לפי שימוש' }

type Item = {
  id: string; name: string; provider: string | null; category: string; status: string
  amount: number; currency: string; billing: string; usage_note: string | null
  is_estimate: boolean; expected_from: string | null; url: string | null; notes: string | null
  created_at: string; updated_at: string
}

const ils = (n: number) => `₪${Math.round(n).toLocaleString()}`
const monthlyIls = (i: Item, rate: number) => {
  const v = i.currency === 'USD' ? Number(i.amount) * rate : Number(i.amount)
  if (i.billing === 'annual') return v / 12
  if (i.billing === 'one_time') return 0
  return v
}

function ItemDrawer({ item, rate, onClose, onSaved }: { item: Item | null; rate: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState<Partial<Item>>({})
  const [loadedId, setLoadedId] = useState<string | null>(null)
  if (item && item.id !== loadedId) { setLoadedId(item.id); setForm({ ...item }) }

  const update = trpc.costs.update.useMutation({
    onSuccess: () => { toast.show('נשמר'); onSaved() },
    onError: e => toast.show(e.message || 'שמירה נכשלה'),
  })
  const remove = trpc.costs.remove.useMutation({
    onSuccess: () => { toast.show('נמחק'); onSaved(); onClose() },
    onError: e => toast.show(e.message || 'מחיקה נכשלה'),
  })
  if (!item) return <Drawer open={false} onClose={onClose} />
  const inp = 'mt-1 w-full bg-sc-bg border border-sc-border rounded-sc-input px-3 py-2 text-[13px] text-sc-text'
  const lbl = 'text-[12px] font-bold text-sc-text-secondary'

  return (
    <Drawer open onClose={onClose} title={item.name} width={520}>
      <div className="p-4 space-y-3 overflow-y-auto">
        <div className="flex items-center gap-2 flex-wrap">
          <Pill kind={STATUS_PILL[item.status] ?? 'neutral'}>{STATUS_LABEL[item.status]}</Pill>
          <Pill kind="neutral">{CAT_LABEL[item.category] ?? item.category}</Pill>
          {item.is_estimate && <Pill kind="warning">אומדן — לאמת מול חשבונית</Pill>}
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] text-sc-primary">
              <ExternalLink size={12} /> לספק
            </a>
          )}
        </div>
        <div className="text-[13px] text-sc-text-secondary">
          שווי חודשי: <b className="text-sc-text">{ils(monthlyIls(item, rate))}</b>
          {item.billing === 'one_time' && ' (חד-פעמי — לא נספר בחודשי)'}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={lbl}>שם<input className={inp} value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>
          <label className={lbl}>ספק<input className={inp} value={form.provider ?? ''} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} /></label>
          <label className={lbl}>קטגוריה
            <select className={inp} value={form.category ?? 'other'} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {Object.entries(CAT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className={lbl}>סטטוס
            <select className={inp} value={form.status ?? 'active'} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className={lbl}>סכום
            <input type="number" dir="ltr" className={inp} value={form.amount ?? 0} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} />
          </label>
          <label className={lbl}>מטבע
            <select className={inp} value={form.currency ?? 'ILS'} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
              <option value="ILS">₪ שקל</option><option value="USD">$ דולר</option>
            </select>
          </label>
          <label className={lbl}>מחזור חיוב
            <select className={inp} value={form.billing ?? 'monthly'} onChange={e => setForm(f => ({ ...f, billing: e.target.value }))}>
              {Object.entries(BILLING_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className={lbl}>צפוי מתאריך (למתוכנן)
            <input type="date" className={inp} value={form.expected_from ? String(form.expected_from).slice(0, 10) : ''} onChange={e => setForm(f => ({ ...f, expected_from: e.target.value || null }))} />
          </label>
        </div>
        <label className={`${lbl} flex items-center gap-2 mt-1`}>
          <input type="checkbox" checked={!!form.is_estimate} onChange={e => setForm(f => ({ ...f, is_estimate: e.target.checked }))} />
          הסכום הוא אומדן (לא מאומת מול חשבונית)
        </label>
        <label className={`${lbl} block`}>הערת שימוש (לחיוב לפי שימוש)
          <input className={inp} value={form.usage_note ?? ''} onChange={e => setForm(f => ({ ...f, usage_note: e.target.value }))} placeholder="למשל: $0.004 להודעת WhatsApp" />
        </label>
        <label className={`${lbl} block`}>הערות
          <textarea className={`${inp} min-h-[60px]`} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </label>

        <div className="flex items-center justify-between pt-2 border-t border-sc-border">
          <button className="inline-flex items-center gap-1 text-[12px] text-sc-danger"
            onClick={() => { if (confirm(`למחוק את ${item.name}?`)) remove.mutate({ id: item.id }) }}>
            <Trash2 size={13} /> מחק
          </button>
          <Button
            disabled={update.isLoading}
            onClick={() => update.mutate({
              id: item.id,
              patch: {
                name: form.name, provider: form.provider ?? null, category: form.category as never,
                status: form.status as never, amount: form.amount, currency: form.currency as never,
                billing: form.billing as never, usage_note: form.usage_note ?? null,
                is_estimate: form.is_estimate, expected_from: form.expected_from ?? null,
                notes: form.notes ?? null,
              },
            })}
          >
            {update.isLoading ? 'שומר…' : 'שמור'}
          </Button>
        </div>
      </div>
    </Drawer>
  )
}

function AddModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const empty = { name: '', provider: '', category: 'other', status: 'active', amount: 0, currency: 'ILS', billing: 'monthly' }
  const [form, setForm] = useState(empty)
  const create = trpc.costs.create.useMutation({
    onSuccess: () => { toast.show('נוסף'); setForm(empty); onClose(); onDone() },
    onError: e => toast.show(e.message?.includes('duplicate') ? 'פריט בשם הזה כבר קיים' : (e.message || 'הוספה נכשלה')),
  })
  const inp = 'mt-1 w-full bg-sc-bg border border-sc-border rounded-sc-input px-3 py-2 text-[13px] text-sc-text'
  const lbl = 'text-[12px] font-bold text-sc-text-secondary'
  return (
    <Modal open={open} onClose={onClose} title="הוספת עלות">
      <div className="grid gap-3 md:grid-cols-2">
        <label className={`${lbl} md:col-span-2`}>שם (חובה)<input className={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>
        <label className={lbl}>ספק<input className={inp} value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} /></label>
        <label className={lbl}>קטגוריה
          <select className={inp} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {Object.entries(CAT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={lbl}>סטטוס
          <select className={inp} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="active">פעיל</option><option value="planned">מתוכנן</option>
          </select>
        </label>
        <label className={lbl}>מחזור
          <select className={inp} value={form.billing} onChange={e => setForm(f => ({ ...f, billing: e.target.value }))}>
            {Object.entries(BILLING_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={lbl}>סכום<input type="number" dir="ltr" className={inp} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} /></label>
        <label className={lbl}>מטבע
          <select className={inp} value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
            <option value="ILS">₪</option><option value="USD">$</option>
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>ביטול</Button>
        <Button disabled={form.name.trim().length < 2 || create.isLoading}
          onClick={() => create.mutate({
            name: form.name.trim(), provider: form.provider || undefined,
            category: form.category as never, status: form.status as never,
            amount: form.amount, currency: form.currency as never, billing: form.billing as never,
          })}>
          {create.isLoading ? 'מוסיף…' : 'הוסף'}
        </Button>
      </div>
    </Modal>
  )
}

export default function AdminCosts() {
  const [statusFilter, setStatusFilter] = useState('')
  const [active, setActive] = useState<Item | null>(null)
  const [adding, setAdding] = useState(false)
  const [rate, setRate] = useState(3.7)

  const utils = trpc.useUtils()
  const refetch = () => { utils.costs.list.invalidate(); utils.costs.summary.invalidate() }
  const summary = trpc.costs.summary.useQuery({ usdRate: rate }, { refetchOnWindowFocus: false })
  const list = trpc.costs.list.useQuery(
    { status: (statusFilter || undefined) as never },
    { refetchOnWindowFocus: false, keepPreviousData: true },
  )
  const s = summary.data
  const rows = useMemo(() => (list.data ?? []) as Item[], [list.data])
  const activeRow = active ? rows.find(r => r.id === active.id) ?? active : null

  const donutData = (s?.byCategory ?? []).map(c => ({ name: CAT_LABEL[c.category] ?? c.category, value: Math.round(c.active) })).filter(d => d.value > 0)
  const barData = (s?.byCategory ?? []).map(c => ({ cat: CAT_LABEL[c.category] ?? c.category, now: Math.round(c.active), launch: Math.round(c.active + c.planned) }))

  const columns: ColumnDef<Item, unknown>[] = [
    {
      accessorKey: 'name', header: 'שם',
      cell: c => (
        <div>
          <div className="font-bold text-sc-text">{c.row.original.name}{c.row.original.is_estimate && <span className="text-sc-warning text-[11px] mr-1">~אומדן</span>}</div>
          {c.row.original.provider && <div className="text-[11px] text-sc-text-muted">{c.row.original.provider}</div>}
        </div>
      ),
    },
    { accessorKey: 'category', header: 'קטגוריה', cell: c => <span className="text-[12px]">{CAT_LABEL[c.getValue() as string] ?? String(c.getValue())}</span> },
    { accessorKey: 'status', header: 'סטטוס', cell: c => <Pill kind={STATUS_PILL[c.getValue() as string] ?? 'neutral'}>{STATUS_LABEL[c.getValue() as string]}</Pill> },
    {
      accessorKey: 'amount', header: 'סכום',
      cell: c => <span dir="ltr" className="text-[13px] font-bold">{c.row.original.currency === 'USD' ? '$' : '₪'}{Number(c.getValue()).toLocaleString()}</span>,
    },
    { accessorKey: 'billing', header: 'מחזור', cell: c => <span className="text-[12px]">{BILLING_LABEL[c.getValue() as string]}</span> },
    {
      id: 'monthly', header: 'שווי חודשי',
      cell: c => <span className="text-[13px]">{c.row.original.billing === 'one_time' ? '—' : ils(monthlyIls(c.row.original, rate))}</span>,
    },
  ]

  const filterBtn = (label: string, val: string) => (
    <button key={val || 'all'} onClick={() => setStatusFilter(val)}
      className={`px-3 py-1 rounded-sc-pill text-[12px] font-bold border ${statusFilter === val ? 'bg-sc-primary text-white border-sc-primary' : 'bg-sc-card text-sc-text border-sc-border'}`}>
      {label}
    </button>
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>עלויות · Cost Dashboard</h1>
          <div className="sub">כל הכלים והשירותים שאנחנו משלמים עליהם — היום, ומה מצטרף בהשקה</div>
        </div>
        <Button onClick={() => setAdding(true)}><Plus size={15} /> הוסף עלות</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="הוצאה חודשית היום" value={ils(s?.activeMonthlyIls ?? 0)} icon={<Wallet size={18} />} tone="primary" index={0} />
        <KpiCard label="צפי חודשי בהשקה" value={ils(s?.launchMonthlyIls ?? 0)} icon={<Rocket size={18} />} tone="gold" index={1} />
        <KpiCard label="שנתי (מצב נוכחי)" value={ils(s?.annualNowIls ?? 0)} icon={<TrendingUp size={18} />} tone="navy" index={2} />
        <KpiCard label="חד-פעמי מתוכנן" value={ils(s?.oneTimePlannedIls ?? 0)} icon={<AlertTriangle size={18} />} tone={(s?.oneTimePlannedIls ?? 0) > 0 ? 'gold' : 'success'} index={3} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <DonutChartCard title="הוצאה חודשית לפי קטגוריה" sub="פריטים פעילים בלבד, בש״ח" data={donutData} index={0} />
        <BarChartCard title="היום מול השקה" sub="שווי חודשי בש״ח לפי קטגוריה — כולל פריטים מתוכננים" data={barData} xKey="cat" yKey="launch" valueFmt={n => ils(n)} index={1} />
      </div>

      <DataTable<Item>
        columns={columns}
        data={rows}
        loading={list.isLoading}
        onRowClick={r => setActive(r)}
        searchPlaceholder="חיפוש שם / ספק…"
        csvName="cost-items"
        pageSize={30}
        emptyTitle="אין פריטי עלות"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            {filterBtn('הכל', '')}
            {filterBtn('פעיל', 'active')}
            {filterBtn('מתוכנן', 'planned')}
            <span className="w-px h-5 bg-sc-border mx-1" />
            <label className="text-[12px] text-sc-text-secondary flex items-center gap-1">
              שער $:
              <input type="number" step="0.05" dir="ltr" className="w-16 bg-sc-bg border border-sc-border rounded-sc-input px-2 py-1 text-[12px]"
                value={rate} onChange={e => setRate(Number(e.target.value) || 3.7)} />
            </label>
          </div>
        }
      />

      <ItemDrawer item={activeRow} rate={rate} onClose={() => setActive(null)} onSaved={refetch} />
      <AddModal open={adding} onClose={() => setAdding(false)} onDone={refetch} />
    </div>
  )
}
