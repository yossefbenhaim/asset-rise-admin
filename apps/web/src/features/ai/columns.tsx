// Column defs for the AI summaries DataTable. Kept separate so the list stays
// declarative and the page thin.
import type { ColumnDef } from '@tanstack/react-table'
import { Sparkles, Users } from 'lucide-react'
import type { AiSummaryRow } from '@asset-rise/shared'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Pill } from '@/components/ui/Pill'
import { dateShort } from '@/lib/format'

// city/locality out of "v10::haifa::g:1234" — the 2nd segment.
function localityOf(rk: string): string | null {
  const seg = rk.split('::')[1]?.trim()
  return seg || null
}

export const aiColumns: ColumnDef<AiSummaryRow, unknown>[] = [
  {
    id: 'summary',
    header: 'תקציר',
    accessorFn: r => r.heading ?? r.summary ?? r.research_key,
    cell: ({ row }) => {
      const r = row.original
      const loc = localityOf(r.research_key)
      return (
        <div className="leading-tight max-w-[420px]">
          <div className="font-semibold text-sc-text inline-flex items-center gap-1.5">
            <Sparkles size={13} className="text-sc-primary shrink-0" />
            <span className="truncate">{r.heading ?? r.summary ?? 'ללא תקציר'}</span>
          </div>
          <div className="text-[11px] text-sc-text-muted truncate sc-num">
            {loc ? `${loc} · ` : ''}{r.research_key}
          </div>
        </div>
      )
    },
  },
  {
    id: 'version',
    header: 'גרסה',
    accessorFn: r => r.version ?? '',
    cell: ({ row }) =>
      row.original.version ? (
        <Pill kind="navy">{row.original.version}</Pill>
      ) : (
        <span className="text-sc-text-muted">—</span>
      ),
  },
  {
    id: 'model',
    header: 'מודל',
    accessorFn: r => r.model ?? '',
    cell: ({ row }) =>
      row.original.model ? (
        <code className="text-[11px] text-sc-text-secondary break-all">{row.original.model}</code>
      ) : (
        <span className="text-sc-text-muted">—</span>
      ),
  },
  {
    id: 'confidence',
    header: 'ביטחון',
    accessorFn: r => r.confidence ?? '',
    cell: ({ row }) => {
      const c = row.original.confidence
      if (!c) return <span className="text-sc-text-muted">—</span>
      const kind = c === 'high' ? 'success' : c === 'low' ? 'warning' : 'info'
      const label = c === 'high' ? 'גבוה' : c === 'low' ? 'נמוך' : c === 'medium' ? 'בינוני' : c
      return <Pill kind={kind as any}>{label}</Pill>
    },
  },
  {
    id: 'panel',
    header: 'פאנל',
    enableSorting: true,
    accessorFn: r => (r.has_perspectives ? 1 : 0),
    cell: ({ row }) =>
      row.original.has_perspectives ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-sc-text-secondary">
          <Users size={13} className="text-sc-gold" /> 3 כובעים
        </span>
      ) : (
        <span className="text-sc-text-muted">—</span>
      ),
  },
  {
    id: 'status',
    header: 'סטטוס',
    accessorFn: r => r.status,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    id: 'updated_at',
    header: 'עודכן',
    accessorFn: r => r.updated_at ?? r.created_at,
    cell: ({ row }) => (
      <span className="text-sc-text-secondary sc-num">
        {dateShort(row.original.updated_at ?? row.original.created_at)}
      </span>
    ),
  },
]
