import type { ColumnDef } from '@tanstack/react-table'
import { trpc } from '@/lib/api/trpc'
import { Pill } from '@/components/ui/Pill'
import { DataTable } from '@/components/ui/DataTable'
import { dateShort } from '@/lib/format'

type Row = Record<string, unknown>

const STAGE_LABEL: Record<string, string> = {
  REGISTRATION: 'הרשמה',
  REP_ELECTION: 'בחירת ועד',
  BATON_TO_REP: 'מעבר שרביט',
  SELECT_ORGANIZER: 'בחירת מארגן',
  SELECT_LAWYER: 'בחירת עו״ד',
  OPEN_TENDERS: 'מכרזים',
  APPRAISER_ARCHITECT: 'שמאי + אדריכל',
  SELECT_DEVELOPER: 'בחירת יזם',
  SECOND_APPRAISAL: 'שמאות שנייה',
  DEADLINES_REVIEW: 'בדיקת לו״ז',
  PERMITS: 'היתרים',
  EVACUATION: 'פינוי',
  CONSTRUCTION: 'בנייה',
  DELIVERY: 'מסירה',
}

export default function AdminBuildings() {
  const list = trpc.buildings.listAll.useQuery()

  const columns: ColumnDef<Row, unknown>[] = [
    {
      id: 'city',
      header: 'עיר',
      accessorFn: r => (r.city as string) ?? '',
      cell: ({ row }) => <span className="font-semibold">{(row.original.city as string) ?? '—'}</span>,
    },
    {
      id: 'address',
      header: 'כתובת',
      accessorFn: r => (r.address as string) ?? '',
      cell: ({ row }) => <span>{(row.original.address as string) || '—'}</span>,
    },
    {
      id: 'tenant_count',
      header: 'דיירים',
      accessorFn: r => (r.tenant_count as number) ?? 0,
      cell: ({ row }) => <span className="sc-num">{(row.original.tenant_count as number) ?? 0}</span>,
    },
    {
      id: 'project',
      header: 'פרויקט / שלב',
      enableSorting: false,
      cell: ({ row }) => {
        const project = row.original.project as { current_stage?: string } | null
        return project ? (
          <Pill kind="success">
            {STAGE_LABEL[project.current_stage ?? ''] ?? project.current_stage ?? 'פעיל'}
          </Pill>
        ) : (
          <Pill kind="neutral">לא נפתח</Pill>
        )
      },
    },
    {
      id: 'invite_code',
      header: 'קוד הזמנה',
      enableSorting: false,
      accessorFn: r => (r.invite_code as string) ?? '',
      cell: ({ row }) => (
        <code className="text-[11px] bg-sc-bg px-1 rounded">{(row.original.invite_code as string) ?? '—'}</code>
      ),
    },
    {
      id: 'created_at',
      header: 'נוצר',
      accessorFn: r => (r.created_at as string) ?? '',
      cell: ({ row }) => (
        <span className="text-sc-text-secondary sc-num">{dateShort(row.original.created_at as string)}</span>
      ),
    },
  ]

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>בניינים</h1>
      </div>

      <DataTable
        columns={columns}
        data={(list.data ?? []) as Row[]}
        loading={list.isLoading}
        csvName="buildings"
        searchPlaceholder="חיפוש בניין…"
        emptyTitle="אין בניינים"
        emptyBody="לא נמצאו בניינים."
      />
    </div>
  )
}
