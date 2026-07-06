// God-mode "Stuck" overview — every open task with no movement past the
// threshold, across all projects, so the team can reach out proactively.
import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle, Users, Building2, ListChecks } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { DataTable } from '@/components/ui/DataTable'
import { Pill } from '@/components/ui/Pill'
import { EmptyState } from '@/components/ui/EmptyState'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { dateShort } from '@/lib/format'
import type { StuckItem } from '@asset-rise/shared'
import { TaskStatusPill } from '@/features/progress/taskStatus'

type Row = StuckItem & Record<string, unknown>

const DAY_OPTS = [7, 14, 30]

const columns: ColumnDef<Row, unknown>[] = [
  {
    id: 'owner',
    header: 'בעל המשימה',
    accessorFn: r => r.owner_name ?? '',
    cell: ({ row }) => {
      const r = row.original
      return (
        <div className="leading-tight">
          <div className="font-semibold text-sc-text">{r.owner_name ?? '— (לא משויך)'}</div>
          {r.owner_role_label && (
            <div className="text-[11px] text-sc-text-muted">{r.owner_role_label}</div>
          )}
        </div>
      )
    },
  },
  {
    id: 'building',
    header: 'בניין',
    accessorFn: r => r.building_address ?? '',
    cell: ({ row }) => row.original.building_address ?? '—',
  },
  {
    id: 'stage',
    header: 'שלב',
    accessorFn: r => r.stage_label ?? '',
    cell: ({ row }) =>
      row.original.stage_label ? <Pill kind="neutral">{row.original.stage_label}</Pill> : '—',
  },
  {
    id: 'task',
    header: 'משימה',
    accessorFn: r => r.title ?? '',
    cell: ({ row }) => <span className="text-sc-text">{row.original.title ?? '—'}</span>,
  },
  {
    id: 'days',
    header: 'ימים תקוע',
    accessorFn: r => r.days,
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1 font-bold text-sc-danger sc-num">
        <AlertTriangle size={13} />
        {row.original.days}
      </span>
    ),
  },
  {
    id: 'due',
    header: 'יעד',
    accessorFn: r => r.due_at ?? '',
    cell: ({ row }) =>
      row.original.due_at ? (
        <span className="sc-num text-sc-text-secondary">{dateShort(row.original.due_at)}</span>
      ) : (
        '—'
      ),
  },
  {
    id: 'status',
    header: 'סטטוס',
    accessorFn: r => r.status ?? '',
    cell: ({ row }) => <TaskStatusPill status={row.original.status} />,
  },
]

export default function GodStuck() {
  const [days, setDays] = useState(7)
  const q = trpc.god.progress.stuck.useQuery({ days, limit: 500 }, { refetchOnWindowFocus: false })
  const d = q.data

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>תקיעות</h1>
          <div className="sub">משימות פתוחות ללא תנועה מעל הסף — לעזרה יזומה ללקוחות</div>
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="bg-sc-bg border border-sc-border rounded-sc-input py-2 px-3 text-[13px] text-sc-text outline-none focus:border-sc-primary cursor-pointer"
          aria-label="סף ימים"
        >
          {DAY_OPTS.map(o => (
            <option key={o} value={o}>
              מעל {o} ימים
            </option>
          ))}
        </select>
      </div>

      {q.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : q.isError || !d ? (
        <EmptyState title="לא ניתן לטעון" body={q.error?.message} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <KpiCard
              label="משימות תקועות"
              value={d.count}
              icon={<ListChecks size={18} />}
              tone={d.count > 0 ? 'danger' : 'success'}
              index={0}
            />
            <KpiCard
              label="משתמשים תקועים"
              value={d.byUser.length}
              icon={<Users size={18} />}
              tone={d.byUser.length > 0 ? 'gold' : 'success'}
              index={1}
            />
            <KpiCard
              label="בניינים מושפעים"
              value={d.byBuilding.length}
              icon={<Building2 size={18} />}
              tone="primary"
              index={2}
            />
          </div>

          {d.count === 0 ? (
            <EmptyState
              icon={<ListChecks size={26} />}
              title="אין תקיעות"
              body={`אין משימות פתוחות מעל ${days} ימים. כל המשתמשים מתקדמים.`}
            />
          ) : (
            <DataTable<Row>
              columns={columns}
              data={(d.items ?? []) as Row[]}
              csvName="stuck"
              searchPlaceholder="חיפוש לפי משתמש / בניין / משימה…"
              emptyTitle="אין תקיעות"
            />
          )}
        </>
      )}
    </div>
  )
}
