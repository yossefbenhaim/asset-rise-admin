// Column defs for the System Logs DataTable. Kept separate from the page so the
// table stays declarative + the page thin. The merged feed is read-only.
import type { ColumnDef } from '@tanstack/react-table'
import type { LogEntry } from '@asset-rise/shared'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Pill } from '@/components/ui/Pill'
import { timeAgo, dateTime } from '@/lib/format'

// Human label per originating subsystem.
const SERVICE_LABEL: Record<string, string> = {
  audit: 'ביקורת',
  analyzer: 'אנלייזר',
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

export const logColumns: ColumnDef<LogEntry, unknown>[] = [
  {
    id: 'severity',
    header: 'חומרה',
    accessorFn: r => r.severity,
    cell: ({ row }) => <StatusBadge status={row.original.severity} />,
  },
  {
    id: 'service',
    header: 'מקור',
    accessorFn: r => r.service,
    cell: ({ row }) => (
      <Pill kind="navy">{SERVICE_LABEL[row.original.service] ?? row.original.service}</Pill>
    ),
  },
  {
    id: 'message',
    header: 'הודעה',
    accessorFn: r => r.message,
    cell: ({ row }) => (
      <span className="block max-w-[420px] truncate text-sc-text" title={row.original.message}>
        {row.original.message}
      </span>
    ),
  },
  {
    id: 'actor',
    header: 'מי',
    enableSorting: false,
    accessorFn: r => r.actorName ?? r.actorEmail ?? r.userId ?? '',
    cell: ({ row }) => {
      const { actorName, actorEmail, userId } = row.original
      // Resolved identity → show the human, not the uuid.
      if (actorName || actorEmail) {
        return (
          <div className="min-w-0 max-w-[220px]">
            <div className="truncate text-[12px] text-sc-text" title={actorName ?? undefined}>
              {actorName ?? actorEmail}
            </div>
            {actorName && actorEmail && (
              <div className="truncate text-[11px] text-sc-text-muted sc-num" title={actorEmail}>
                {actorEmail}
              </div>
            )}
          </div>
        )
      }
      // Unresolved actor (deleted profile / not found) — degrade to a short id.
      if (userId) {
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-sc-text-secondary">
            <span className="text-sc-text-muted">משתמש</span>
            <code className="sc-num" title={userId}>
              {shortId(userId)}
            </code>
          </span>
        )
      }
      return <span className="text-sc-text-muted">מערכת</span>
    },
  },
  {
    id: 'ref',
    header: 'הפניה',
    enableSorting: false,
    accessorFn: r => r.reportId ?? '',
    cell: ({ row }) => {
      const { reportId } = row.original
      if (reportId) {
        return (
          <span className="inline-flex items-center gap-1 text-[11px] text-sc-text-secondary">
            <span className="text-sc-text-muted">דוח</span>
            <code className="sc-num" title={reportId}>
              {shortId(reportId)}
            </code>
          </span>
        )
      }
      return <span className="text-sc-text-muted">—</span>
    },
  },
  {
    id: 'timestamp',
    header: 'מתי',
    accessorFn: r => r.timestamp,
    cell: ({ row }) => (
      <span className="text-sc-text-secondary sc-num" title={dateTime(row.original.timestamp)}>
        {timeAgo(row.original.timestamp)}
      </span>
    ),
  },
]
