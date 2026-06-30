// Column defs for the Wong verifications DataTable. Read-only: the agent owns
// the verdicts, the admin only watches. Kept declarative + separate from the
// page.
import type { ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, XCircle, Clock3, FileText } from 'lucide-react'
import type { WongVerification } from '@asset-rise/shared'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Pill } from '@/components/ui/Pill'
import { timeAgo, dateTime } from '@/lib/format'

// Hebrew labels per tenant-document category (sc_tenant_documents.category).
const CATEGORY_LABEL: Record<string, string> = {
  tabu: 'נסח טאבו',
  ownership_certificate: 'תעודת בעלות',
  purchase_contract: 'חוזה רכישה',
  inheritance: 'צו ירושה',
  power_of_attorney: 'ייפוי כוח',
  other: 'אחר',
}

// The agent's verdict cell: approved / rejected / not-yet-decided.
export function AiVerdict({ approved }: { approved: boolean | null }) {
  if (approved === true) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-bold text-sc-success">
        <CheckCircle2 size={14} /> אושר
      </span>
    )
  }
  if (approved === false) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-bold text-sc-danger">
        <XCircle size={14} /> נדחה
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-sc-text-muted">
      <Clock3 size={14} /> בבדיקה
    </span>
  )
}

export const wongColumns: ColumnDef<WongVerification, unknown>[] = [
  {
    id: 'status',
    header: 'סטטוס',
    accessorFn: (r) => r.status,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: 'doc',
    header: 'מסמך',
    accessorFn: (r) => r.docLabel,
    cell: ({ row }) => {
      const { docLabel, docName } = row.original
      return (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sc-text font-medium">
            <FileText size={13} className="shrink-0 text-sc-text-muted" />
            <span className="truncate max-w-[240px]" title={docLabel}>
              {docLabel}
            </span>
          </div>
          {docName && (
            <div className="text-[11px] text-sc-text-muted truncate max-w-[240px]" title={docName}>
              {docName}
            </div>
          )}
        </div>
      )
    },
  },
  {
    id: 'category',
    header: 'סוג',
    enableSorting: false,
    accessorFn: (r) => r.docCategory ?? '',
    cell: ({ row }) => {
      const c = row.original.docCategory
      if (!c) return <span className="text-sc-text-muted">—</span>
      return <Pill kind="navy">{CATEGORY_LABEL[c] ?? c}</Pill>
    },
  },
  {
    id: 'tenant',
    header: 'דייר',
    accessorFn: (r) => r.tenant ?? '',
    cell: ({ row }) =>
      row.original.tenant ? (
        <span className="text-sc-text">{row.original.tenant}</span>
      ) : (
        <span className="text-sc-text-muted">—</span>
      ),
  },
  {
    id: 'verdict',
    header: 'הכרעת הסוכן',
    enableSorting: false,
    accessorFn: (r) => (r.aiApproved === null ? 2 : r.aiApproved ? 1 : 0),
    cell: ({ row }) => <AiVerdict approved={row.original.aiApproved} />,
  },
  {
    id: 'reason',
    header: 'נימוק',
    enableSorting: false,
    accessorFn: (r) => r.reason ?? '',
    cell: ({ row }) => {
      const reason = row.original.reason ?? row.original.error
      if (!reason) return <span className="text-sc-text-muted">—</span>
      return (
        <span
          className="block max-w-[320px] truncate text-[12px] text-sc-text-secondary"
          title={reason}
        >
          {reason}
        </span>
      )
    },
  },
  {
    id: 'createdAt',
    header: 'מתי',
    accessorFn: (r) => r.createdAt,
    cell: ({ row }) => (
      <span className="text-sc-text-secondary sc-num" title={dateTime(row.original.createdAt)}>
        {timeAgo(row.original.createdAt)}
      </span>
    ),
  },
]
