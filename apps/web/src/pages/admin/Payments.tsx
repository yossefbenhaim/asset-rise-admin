import { useState } from 'react'
import { Banknote, CheckCircle2, XCircle, Undo2 } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { DataTable } from '@/components/ui/DataTable'
import type { PaymentRow, PaymentStatus } from '@asset-rise/shared'
import { paymentColumns } from '@/features/payments/columns'
import { DemoNotice } from '@/features/payments/DemoNotice'
import { nis } from '@/lib/format'

const STATUS_OPTIONS: { value: '' | PaymentStatus; label: string }[] = [
  { value: '', label: 'כל הסטטוסים' },
  { value: 'paid', label: 'שולם' },
  { value: 'pending', label: 'ממתין' },
  { value: 'failed', label: 'נכשל' },
  { value: 'refunded', label: 'הוחזר' },
]

export default function AdminPayments() {
  const [status, setStatus] = useState<'' | PaymentStatus>('')

  // Totals are computed server-side over ALL payments and stay stable while
  // the status filter narrows the rows, so the KPI cards don't jump.
  const list = trpc.payments.list.useQuery(
    status ? { status } : undefined,
    { refetchOnWindowFocus: false },
  )

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
    </div>
  )
}
