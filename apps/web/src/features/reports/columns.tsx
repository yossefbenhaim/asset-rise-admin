// Column defs for the Reports DataTable. Kept separate from the page so the
// table stays declarative + the page thin.
import type { ColumnDef } from '@tanstack/react-table'
import { Star } from 'lucide-react'
import type { ReportRow } from '@asset-rise/shared'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Pill } from '@/components/ui/Pill'
import { dateShort } from '@/lib/format'
import { scoreTone } from './scoreColor'

export const reportColumns: ColumnDef<ReportRow, unknown>[] = [
  {
    id: 'pinned',
    header: '',
    enableSorting: true,
    accessorFn: r => (r.pinned ? 1 : 0),
    cell: ({ row }) =>
      row.original.pinned ? (
        <Star size={14} className="text-sc-gold fill-sc-gold" />
      ) : (
        <span className="inline-block w-[14px]" />
      ),
  },
  {
    id: 'address',
    header: 'כתובת',
    accessorFn: r => r.address_display ?? '',
    cell: ({ row }) => (
      <span className="font-semibold text-sc-text">{row.original.address_display ?? '—'}</span>
    ),
  },
  {
    id: 'city',
    header: 'עיר',
    accessorFn: r => r.city ?? '',
    cell: ({ row }) => row.original.city ?? '—',
  },
  {
    id: 'gushhelka',
    header: 'גוש/חלקה',
    enableSorting: false,
    accessorFn: r => `${r.gush ?? ''} ${r.helka ?? ''}`,
    cell: ({ row }) => {
      const { gush, helka } = row.original
      if (gush == null && helka == null) return <span className="text-sc-text-muted">—</span>
      return (
        <span className="sc-num text-sc-text-secondary">
          {gush ?? '—'} / {helka ?? '—'}
        </span>
      )
    },
  },
  {
    id: 'score',
    header: 'ציון',
    accessorFn: r => r.score ?? -1,
    cell: ({ row }) => {
      const t = scoreTone(row.original.score)
      return (
        <span
          className={`inline-grid place-items-center min-w-[34px] h-[26px] px-2 rounded-sc-pill text-[12px] font-extrabold sc-num ${t.bg} ${t.text}`}
        >
          {t.label}
        </span>
      )
    },
  },
  {
    id: 'status',
    header: 'סטטוס',
    accessorFn: r => r.status,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
    id: 'lead',
    header: 'ליד',
    accessorFn: r => r.lead_name ?? r.lead_email ?? '',
    cell: ({ row }) => {
      const { lead_name, lead_email } = row.original
      if (!lead_name && !lead_email) return <span className="text-sc-text-muted">—</span>
      return (
        <div className="leading-tight">
          {lead_name && <div className="text-sc-text">{lead_name}</div>}
          {lead_email && <div className="text-[11px] text-sc-text-muted">{lead_email}</div>}
        </div>
      )
    },
  },
  {
    id: 'paid',
    header: 'תשלום',
    accessorFn: r => (r.paid ? 1 : 0),
    cell: ({ row }) =>
      row.original.paid ? <Pill kind="success">שולם</Pill> : <Pill kind="neutral">לא שולם</Pill>,
  },
]
