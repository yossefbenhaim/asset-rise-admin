// Column defs for the Payments DataTable. Kept separate from the page so the
// table stays declarative + the page thin.
import type { ColumnDef } from '@tanstack/react-table'
import type { PaymentRow } from '@asset-rise/shared'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { dateShort, nis } from '@/lib/format'

export const paymentColumns: ColumnDef<PaymentRow, unknown>[] = [
  {
    id: 'customer',
    header: 'לקוח',
    accessorFn: r => r.lead_email ?? r.user_id ?? '',
    cell: ({ row }) => {
      const { lead_email, user_id } = row.original
      if (!lead_email && !user_id) return <span className="text-sc-text-muted">—</span>
      return (
        <div className="leading-tight">
          {lead_email && <div className="text-sc-text font-medium">{lead_email}</div>}
          {user_id && (
            <div className="text-[11px] text-sc-text-muted font-mono" dir="ltr">
              {user_id}
            </div>
          )}
        </div>
      )
    },
  },
  {
    id: 'report_token',
    header: 'דוח',
    enableSorting: false,
    accessorFn: r => r.report_token ?? '',
    cell: ({ row }) =>
      row.original.report_token ? (
        <span className="text-[11px] text-sc-text-secondary font-mono" dir="ltr">
          {row.original.report_token}
        </span>
      ) : (
        <span className="text-sc-text-muted">—</span>
      ),
  },
  {
    id: 'amount',
    header: 'סכום',
    accessorFn: r => r.amount,
    cell: ({ row }) => (
      <span className="sc-num font-bold text-sc-text">{nis(row.original.amount)}</span>
    ),
  },
  {
    id: 'status',
    header: 'סטטוס',
    accessorFn: r => r.status,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: 'provider',
    header: 'ספק',
    accessorFn: r => r.provider ?? '',
    cell: ({ row }) =>
      row.original.provider ? (
        <span className="text-sc-text-secondary capitalize">{row.original.provider}</span>
      ) : (
        <span className="text-sc-text-muted">—</span>
      ),
  },
  {
    id: 'txn_id',
    header: 'מזהה עסקה',
    enableSorting: false,
    accessorFn: r => r.txn_id ?? '',
    cell: ({ row }) =>
      row.original.txn_id ? (
        <span className="text-[11px] text-sc-text-secondary font-mono" dir="ltr">
          {row.original.txn_id}
        </span>
      ) : (
        <span className="text-sc-text-muted">—</span>
      ),
  },
  {
    id: 'created_at',
    header: 'נוצר',
    accessorFn: r => r.created_at,
    cell: ({ row }) => (
      <span className="text-sc-text-secondary sc-num">{dateShort(row.original.created_at)}</span>
    ),
  },
  {
    id: 'paid_at',
    header: 'שולם בתאריך',
    accessorFn: r => r.paid_at ?? '',
    cell: ({ row }) =>
      row.original.paid_at ? (
        <span className="text-sc-text-secondary sc-num">{dateShort(row.original.paid_at)}</span>
      ) : (
        <span className="text-sc-text-muted">—</span>
      ),
  },
]
