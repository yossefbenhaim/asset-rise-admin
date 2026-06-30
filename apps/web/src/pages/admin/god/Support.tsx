// God-mode support inbox — every system-chat thread, newest activity first.
// Threads where the user spoke last are flagged "ממתין לתשובה". Row-click opens
// the conversation.
import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { MessageSquare, Inbox } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { DataTable } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Pill } from '@/components/ui/Pill'
import { KpiCard } from '@/components/ui/KpiCard'
import { timeAgo } from '@/lib/format'
import type { GodSupportThreadListItem } from '@asset-rise/shared'
import { SupportChat } from '@/features/support/SupportChat'

type Row = GodSupportThreadListItem & Record<string, unknown>

const ROLE_LABEL: Record<string, string> = { tenant: 'דייר', provider: 'נותן שירות' }

export default function GodSupport() {
  const q = trpc.god.support.list.useQuery(undefined, { refetchInterval: 8000, refetchOnWindowFocus: true })
  const [active, setActive] = useState<{ id: string; name: string | null } | null>(null)

  const rows = (q.data ?? []) as Row[]
  const awaiting = rows.filter(r => r.awaiting_reply).length

  const columns: ColumnDef<Row, unknown>[] = [
    {
      id: 'user',
      header: 'משתמש',
      accessorFn: r => r.user_name ?? r.user_email ?? '',
      cell: ({ row }) => {
        const r = row.original
        return (
          <div className="leading-tight">
            <div className="font-semibold text-sc-text">{r.user_name ?? r.user_email ?? '—'}</div>
            <div className="text-[11px] text-sc-text-muted">{r.user_role ? (ROLE_LABEL[r.user_role] ?? r.user_role) : ''}</div>
          </div>
        )
      },
    },
    { id: 'building', header: 'בניין', accessorFn: r => r.building_address ?? '', cell: ({ row }) => row.original.building_address ?? '—' },
    {
      id: 'last',
      header: 'הודעה אחרונה',
      enableSorting: false,
      accessorFn: r => r.last_message_preview ?? '',
      cell: ({ row }) => {
        const r = row.original
        return (
          <div className="flex items-center gap-2 max-w-[340px]">
            {r.awaiting_reply && <Pill kind="gold">ממתין לתשובה</Pill>}
            <span className="text-sc-text-secondary truncate">{r.last_message_preview ?? '—'}</span>
          </div>
        )
      },
    },
    {
      id: 'updated',
      header: 'עדכון אחרון',
      accessorFn: r => r.last_message_at ?? '',
      cell: ({ row }) => row.original.last_message_at
        ? <span className="text-sc-text-secondary">{timeAgo(row.original.last_message_at)}</span>
        : <span className="text-sc-text-muted">—</span>,
    },
  ]

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>צ'אט מערכת — תיבת נכנס</h1>
          <div className="sub">כל שיחות התמיכה עם הלקוחות — הממתינות לתשובה מסומנות</div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <KpiCard label="שיחות פעילות" value={rows.length} icon={<MessageSquare size={18} />} tone="primary" index={0} />
        <KpiCard label="ממתינות לתשובה" value={awaiting} icon={<Inbox size={18} />} tone={awaiting > 0 ? 'gold' : 'success'} index={1} />
      </div>

      <DataTable<Row>
        columns={columns}
        data={rows}
        loading={q.isLoading}
        onRowClick={r => setActive({ id: r.user_id, name: r.user_name })}
        csvName="support-threads"
        searchPlaceholder="חיפוש לפי משתמש / בניין…"
        emptyTitle="אין שיחות עדיין"
        emptyBody="כשתפתח צ'אט עם לקוח (ממסך דייר/ספק) הוא יופיע כאן."
      />

      <Modal open={!!active} onClose={() => setActive(null)} title={active?.name ? `צ'אט עם ${active.name}` : 'צ\'אט מערכת'} icon={<MessageSquare size={18} />} size="lg">
        {active && <SupportChat userId={active.id} userName={active.name} />}
      </Modal>
    </div>
  )
}
