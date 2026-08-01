import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Timer, Camera } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { DataTable } from '@/components/ui/DataTable'

// History for the weekly test ecosystem — "did it pass, and when did it last".
//
// The verdict is deliberately three-valued, not two. `rc=1` is a product
// failure; `rc=2` is the harness failing to start (no dev server, missing
// browser, timeout). Painting both red is how a suite loses its credibility:
// a week of infrastructure noise looks exactly like a week of real bugs, and
// the reasonable response to that is to stop reading the alerts.

type Row = {
  id: string
  run_id: string
  tier: string
  rc: number
  verdict: string
  specs_passed: number
  specs_failed: number
  duration_s: number
  branch: string | null
  sha: string | null
  report_url: string | null
  details: {
    shots?: number
    authz?: { checks?: number; leaks?: number; blocks?: number }
    concurrent?: { wallMs?: number; talkers?: number }
  } | null
  created_at: string
}

const TIER_LABEL: Record<string, string> = {
  hermetic: 'דפדפן — הרמטי',
  matrix: 'מטריצת שומרים',
  authz: 'הרשאות שרת',
  staging: 'סטייג׳ינג',
  prod: 'ייצור (smoke)',
}

function Verdict({ rc }: { rc: number }) {
  if (rc === 0)
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-700">
        <CheckCircle2 size={16} strokeWidth={1.5} /> ירוק
      </span>
    )
  if (rc === 1)
    return (
      <span className="inline-flex items-center gap-1.5 text-red-700">
        <XCircle size={16} strokeWidth={1.5} /> נכשל
      </span>
    )
  if (rc === 2)
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-700">
        <AlertTriangle size={16} strokeWidth={1.5} /> תקלת תשתית
      </span>
    )
  return <span className="text-slate-500">דילוג</span>
}

const fmtDuration = (s: number) => (s >= 60 ? `${Math.round(s / 60)} דק׳` : `${s} שנ׳`)

export default function AdminTestRuns() {
  const latest = trpc.testRuns.latest.useQuery()
  const list = trpc.testRuns.list.useQuery({ limit: 200 })

  const rows = useMemo(() => (list.data ?? []) as Row[], [list.data])
  const heads = useMemo(() => (latest.data ?? []) as Row[], [latest.data])

  // The authorization sweep's own numbers are the headline the rest of this
  // page exists to support: how many (procedure × persona) pairs were checked,
  // and whether any persona reached something it should not have.
  const authz = heads.find(h => h.tier === 'authz')?.details?.authz

  const columns: ColumnDef<Row, unknown>[] = [
    {
      accessorKey: 'created_at',
      header: 'מתי',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-slate-600">
          {new Date(row.original.created_at).toLocaleString('he-IL')}
        </span>
      ),
    },
    {
      accessorKey: 'tier',
      header: 'שכבה',
      cell: ({ row }) => TIER_LABEL[row.original.tier] ?? row.original.tier,
    },
    { accessorKey: 'rc', header: 'מצב', cell: ({ row }) => <Verdict rc={row.original.rc} /> },
    {
      id: 'specs',
      header: 'ספקים',
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.specs_passed} / {row.original.specs_passed + row.original.specs_failed}
        </span>
      ),
    },
    {
      id: 'detail',
      header: 'פירוט',
      cell: ({ row }) => {
        const d = row.original.details ?? {}
        if (d.authz?.checks) {
          return (
            <span className="tabular-nums text-slate-600">
              {d.authz.checks} בדיקות · {d.authz.leaks ?? 0} דליפות · {d.authz.blocks ?? 0} חסימות
              שגויות
            </span>
          )
        }
        if (d.shots) return <span className="text-slate-600">{d.shots} צילומים</span>
        return <span className="text-slate-400">—</span>
      },
    },
    {
      accessorKey: 'duration_s',
      header: 'משך',
      cell: ({ row }) => fmtDuration(row.original.duration_s),
    },
    {
      accessorKey: 'sha',
      header: 'commit',
      cell: ({ row }) => (
        <code className="text-xs text-slate-500" dir="ltr">
          {row.original.sha ?? '—'}
        </code>
      ),
    },
    {
      id: 'report',
      header: '',
      cell: ({ row }) =>
        row.original.report_url ? (
          <a
            className="text-sm font-semibold text-blue-700 hover:underline"
            href={row.original.report_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            דוח ←
          </a>
        ) : null,
    },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-900">בדיקות אוטומטיות</h1>
        <p className="mt-1 text-sm text-slate-500">
          רץ אוטומטית פעם בשבוע. אדום = כשל במוצר, כתום = הרתמה לא הצליחה לעלות — לא אותו דבר.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {heads.map((h, i) => (
          <KpiCard
            key={h.tier}
            index={i}
            label={TIER_LABEL[h.tier] ?? h.tier}
            value={h.rc === 0 ? 'ירוק' : h.rc === 1 ? `${h.specs_failed} נכשלו` : 'תשתית'}
            tone={h.rc === 0 ? 'primary' : undefined}
            icon={
              h.rc === 0 ? (
                <CheckCircle2 size={18} />
              ) : h.rc === 1 ? (
                <XCircle size={18} />
              ) : (
                <AlertTriangle size={18} />
              )
            }
          />
        ))}
        {authz?.checks ? (
          <KpiCard
            index={heads.length}
            label="בדיקות הרשאה (פרוצדורה × פרסונה)"
            value={authz.checks}
            icon={<ShieldCheck size={18} />}
          />
        ) : null}
      </div>

      {authz && (authz.leaks ?? 0) > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <strong>{authz.leaks} דליפות הרשאה</strong> — פרסונה הגיעה לפעולה שאסורה לה. זה החמור
          ביותר שהמערכת הזו יודעת למצוא; פתחו את הדוח של הריצה.
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        loading={list.isLoading}
        csvName="test-runs"
        emptyTitle="עדיין אין ריצות"
        emptyBody="הריצה השבועית תופיע כאן אחרי ההרצה הראשונה."
      />

      <p className="flex items-center gap-4 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Timer size={13} strokeWidth={1.5} /> ריצה שבועית · ~חצי שעה
        </span>
        <span className="inline-flex items-center gap-1">
          <Camera size={13} strokeWidth={1.5} /> הצילומים נלכדים גם בריצה ירוקה
        </span>
      </p>
    </div>
  )
}
