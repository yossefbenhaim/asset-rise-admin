import { useState } from 'react'
import { Banknote, CheckCircle2, XCircle, Undo2 } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { DataTable } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { StatusBadge } from '@/components/ui/StatusBadge'
import type { PaymentRow, PaymentStatus } from '@asset-rise/shared'
import { paymentColumns } from '@/features/payments/columns'
import { DemoNotice } from '@/features/payments/DemoNotice'
import { nis, dateTime } from '@/lib/format'

const STATUS_OPTIONS: { value: '' | PaymentStatus; label: string }[] = [
  { value: '', label: 'כל הסטטוסים' },
  { value: 'paid', label: 'שולם' },
  { value: 'pending', label: 'ממתין' },
  { value: 'failed', label: 'נכשל' },
  { value: 'refunded', label: 'הוחזר' },
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-sc-border last:border-0">
      <span className="text-[11px] text-sc-text-muted">{label}</span>
      <span className="text-[13px] text-sc-text break-all">{children}</span>
    </div>
  )
}

export default function AdminPayments() {
  const [status, setStatus] = useState<'' | PaymentStatus>('')
  const [selected, setSelected] = useState<PaymentRow | null>(null)

  // Totals are computed server-side over ALL payments and stay stable while
  // the status filter narrows the rows, so the KPI cards don't jump.
  const list = trpc.payments.list.useQuery(status ? { status } : undefined, {
    refetchOnWindowFocus: false,
  })

  const rows: PaymentRow[] = list.data?.rows ?? []
  const totals = list.data?.totals

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>תשלומים</h1>
      </div>

      <DemoNotice />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label="סך הכנסות (שולם)"
          value={totals?.revenue_paid ?? 0}
          format={nis}
          icon={<Banknote size={18} />}
          tone="success"
          index={0}
        />
        <KpiCard
          label="תשלומים ששולמו"
          value={totals?.count_paid ?? 0}
          icon={<CheckCircle2 size={18} />}
          tone="primary"
          index={1}
        />
        <KpiCard
          label="תשלומים שנכשלו"
          value={totals?.count_failed ?? 0}
          icon={<XCircle size={18} />}
          tone="danger"
          index={2}
        />
        <KpiCard
          label="זוכו"
          value={totals?.count_refunded ?? 0}
          icon={<Undo2 size={18} />}
          tone="gold"
          index={3}
        />
      </div>

      <DataTable<PaymentRow>
        columns={paymentColumns}
        data={rows}
        loading={list.isLoading}
        csvName="payments"
        onRowClick={setSelected}
        searchPlaceholder="חיפוש לפי אימייל, ספק, מזהה עסקה…"
        emptyTitle="אין תשלומים"
        emptyBody="כשלקוחות ישלמו עבור דוחות התשלומים יופיעו כאן."
        toolbar={
          <select
            value={status}
            onChange={e => setStatus(e.target.value as '' | PaymentStatus)}
            className="bg-sc-bg border border-sc-border rounded-sc-input py-2 pr-3 pl-8 text-[13px] text-sc-text outline-none focus:border-sc-primary transition-colors cursor-pointer"
            aria-label="סינון לפי סטטוס"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        }
      />

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="פרטי תשלום"
        icon={<Banknote size={18} />}
      >
        {selected && (
          <div className="flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-1">
              <span className="sc-num text-[22px] font-bold text-sc-text">
                {nis(selected.amount)}
              </span>
              <StatusBadge status={selected.status} />
            </div>
            <Field label="סטטוס">{STATUS_LABEL[selected.status] ?? selected.status}</Field>
            <Field label="לקוח (אימייל)">{selected.lead_email ?? '—'}</Field>
            <Field label="מזהה משתמש">
              <span className="font-mono" dir="ltr">
                {selected.user_id ?? '—'}
              </span>
            </Field>
            <Field label="טוקן דוח">
              <span className="font-mono" dir="ltr">
                {selected.report_token ?? '—'}
              </span>
            </Field>
            <Field label="ספק סליקה">
              <span className="capitalize">{selected.provider ?? '—'}</span>
            </Field>
            <Field label="מזהה עסקה">
              <span className="font-mono" dir="ltr">
                {selected.txn_id ?? '—'}
              </span>
            </Field>
            <Field label="נוצר">{dateTime(selected.created_at)}</Field>
            <Field label="שולם בתאריך">{selected.paid_at ? dateTime(selected.paid_at) : '—'}</Field>
          </div>
        )}
      </Modal>
    </div>
  )
}

const STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: 'שולם',
  pending: 'ממתין',
  failed: 'נכשל',
  refunded: 'הוחזר',
}
