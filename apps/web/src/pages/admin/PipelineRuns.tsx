import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Server, CheckCircle2, Coins, FileStack, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { DataTable } from '@/components/ui/DataTable'

type Step = { t: string; msg: string }
type Run = {
  id: string
  created_at: string
  plan_number: string | null
  mp_id: string | null
  city: string | null
  street: string | null
  building_number: string | null
  gush: number | null
  zips_downloaded: number | null
  pdfs_extracted: number | null
  docs: Array<{ type: string; ai_visible: boolean; pii_removed: number }> | null
  economics_found: boolean | null
  status: string | null
  duration_s: number | null
  stage: string | null
  steps: Step[] | null
  downloaded_count: number | null
  last_file: string | null
}

const STAGE_HE: Record<string, string> = {
  picked: 'זוהתה תכנית', vpn: 'מרים VPN', downloading: 'מוריד מסמכים',
  reading: 'קורא ומסנן', codex: 'Codex מחלץ', done: 'הושלם',
}
const STATUS_HE: Record<string, { label: string; cls: string }> = {
  success: { label: 'הושלם', cls: 'bg-emerald-100 text-emerald-700' },
  partial: { label: 'חלקי', cls: 'bg-amber-100 text-amber-700' },
  empty: { label: 'ריק', cls: 'bg-slate-100 text-slate-600' },
  failed: { label: 'נכשל', cls: 'bg-rose-100 text-rose-700' },
  started: { label: 'רץ…', cls: 'bg-sky-100 text-sky-700' },
}
const addr = (r: Run) => [r.city, r.street, r.building_number].filter(Boolean).join(' ') || '—'

// A live card for a run still in progress — updates every few seconds.
function LiveRun({ r }: { r: Run }) {
  const steps = r.steps ?? []
  const last = steps[steps.length - 1]
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 size={18} className="animate-spin text-sky-600" />
        <span className="font-semibold">{addr(r)}</span>
        <span className="font-mono text-xs text-slate-500">{r.plan_number}</span>
        <span className="ms-auto text-xs px-2 py-0.5 rounded bg-sky-600 text-white font-semibold">{STAGE_HE[r.stage ?? ''] ?? r.stage ?? 'רץ'}</span>
      </div>
      {r.stage === 'downloading' && (
        <div className="text-sm text-sky-800 mb-1">מוריד קבצים: <b className="tabular-nums">{r.downloaded_count ?? 0}</b>{r.last_file ? <span className="text-slate-500"> · אחרון: {r.last_file}</span> : null}</div>
      )}
      {last && <div className="text-sm text-slate-700">{last.msg}</div>}
      <ol className="mt-2 border-s-2 border-sky-200 ps-3 space-y-1">
        {steps.slice(-6).map((s, i) => (
          <li key={i} className="text-xs text-slate-500">
            <span className="tabular-nums">{new Date(s.t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> · {s.msg}
          </li>
        ))}
      </ol>
    </div>
  )
}

type Search = {
  id: string; created_at: string; city: string | null; street: string | null; building_number: string | null
  gush: number | null; chelka: number | null; plan_number: string | null; cache_level: string | null
  score: number | null; bucket: string | null; ai_status: string | null; has_economics: boolean | null
  economics_source: string | null; docs_pending: boolean | null
}
const AI_HE: Record<string, string> = { done: 'הושלם', pending: 'ממתין', running: 'רץ', disabled: '—', failed: 'נכשל' }

// One search rendered as a data-flow: address → plan → source → AI → economics → score.
function SearchFlow({ s }: { s: Search }) {
  const a = [s.city, s.street, s.building_number].filter(Boolean).join(' ') || '—'
  const fresh = (s.cache_level ?? '') === 'fresh'
  const chips: { label: string; cls: string }[] = [
    { label: a, cls: 'bg-slate-800 text-white' },
    { label: `גוש ${s.gush ?? '?'}${s.chelka ? '/' + s.chelka : ''}${s.plan_number ? ' · ' + s.plan_number : ''}`, cls: 'bg-indigo-100 text-indigo-800' },
    { label: fresh ? '🔵 חיפוש טרי' : `⚡ מטמון ${(s.cache_level ?? '').toUpperCase()}`, cls: fresh ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800' },
    { label: `AI: ${AI_HE[s.ai_status ?? ''] ?? s.ai_status ?? '—'}`, cls: 'bg-slate-100 text-slate-700' },
    { label: s.docs_pending ? '⏳ מוריד מסמכים' : s.has_economics ? `💰 כלכלה ✓ (${s.economics_source === 'ai' ? 'Codex' : 'שומה'})` : 'כלכלה —', cls: s.has_economics ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-400' },
    { label: `ציון ${s.score ?? '—'}`, cls: 'bg-emerald-600 text-white' },
  ]
  return (
    <div className="flex items-center gap-1 flex-wrap py-2 border-b border-slate-100 last:border-0">
      <span className="text-[11px] text-slate-400 tabular-nums w-24 shrink-0">{new Date(s.created_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
      {chips.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-300">←</span>}
          <span className={`text-xs px-2 py-1 rounded-md font-medium ${c.cls}`}>{c.label}</span>
        </span>
      ))}
    </div>
  )
}

export default function AdminPipelineRuns() {
  // auto-refresh every 4s so the whole VPN → download → Codex chain updates LIVE
  const list = trpc.pipelineRuns.list.useQuery({ limit: 500 }, { refetchInterval: 4000, refetchOnWindowFocus: true })
  const searchList = trpc.pipelineRuns.searches.useQuery({ limit: 200 }, { refetchInterval: 4000, refetchOnWindowFocus: true })
  const searches = (searchList.data ?? []) as Search[]
  const rows = (list.data ?? []) as Run[]
  const live = rows.filter(r => r.stage && r.stage !== 'done' && r.status === 'started')

  const kpis = useMemo(() => ({
    total: rows.length,
    success: rows.filter(r => r.status === 'success').length,
    econ: rows.filter(r => r.economics_found).length,
    docs: rows.reduce((s, r) => s + (r.pdfs_extracted ?? 0), 0),
  }), [rows])

  const columns = useMemo<ColumnDef<Run, unknown>[]>(() => [
    { header: 'זמן', accessorKey: 'created_at', cell: ({ row }) => <span className="tabular-nums text-xs text-slate-500">{new Date(row.original.created_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span> },
    { header: 'כתובת', id: 'address', accessorFn: r => addr(r), cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
    { header: 'תכנית', accessorKey: 'plan_number', cell: ({ row }) => <span className="font-mono text-xs">{row.original.plan_number || '—'}</span> },
    { header: 'שלב', accessorKey: 'stage', cell: ({ row }) => <span className="text-xs">{STAGE_HE[row.original.stage ?? ''] ?? '—'}</span> },
    { header: 'קבצים', id: 'files', accessorFn: r => r.pdfs_extracted ?? 0, cell: ({ row }) => <span className="tabular-nums text-xs">{row.original.pdfs_extracted ?? 0} PDF · {row.original.zips_downloaded ?? 0} ZIP</span> },
    {
      header: 'נקרא', id: 'read', accessorFn: r => (r.docs ?? []).filter(d => d.ai_visible).length,
      cell: ({ row }) => {
        const docs = row.original.docs ?? []
        const read = docs.filter(d => d.ai_visible).length
        const skipped = docs.length - read
        const types = [...new Set(docs.filter(d => d.ai_visible).map(d => d.type))].slice(0, 6).join(' · ')
        return <div className="text-xs" title={types}><span className="text-emerald-700 font-semibold">{read} נקראו</span>{skipped > 0 && <span className="text-slate-400"> · {skipped} דולגו</span>}{types && <div className="text-slate-500 truncate max-w-[280px]">{types}</div>}</div>
      },
    },
    { header: 'כלכלה', id: 'econ', accessorFn: r => (r.economics_found ? 1 : 0), cell: ({ row }) => row.original.economics_found ? <span className="text-xs px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">שומה ✓</span> : <span className="text-xs text-slate-400">—</span> },
    { header: 'סטטוס', accessorKey: 'status', cell: ({ row }) => { const s = STATUS_HE[row.original.status ?? 'started'] ?? STATUS_HE.started; return <span className={`text-xs px-2 py-0.5 rounded font-semibold ${s.cls}`}>{s.label}</span> } },
    { header: 'משך', accessorKey: 'duration_s', cell: ({ row }) => <span className="tabular-nums text-xs text-slate-500">{row.original.duration_s != null ? `${row.original.duration_s}ש׳` : '—'}</span> },
  ], [])

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>מקורות · שרת VPN (MAVAT)</h1>
        <p className="text-sm text-slate-500">שליפת מסמכי תכנית דרך ה-VPN הישראלי, בזמן אמת: זיהוי תכנית → הורדה → קריאה → Codex. מתעדכן אוטומטית. ללא פרטים אישיים.</p>
      </div>

      {live.length > 0 && (
        <div className="mb-4">
          <div className="text-sm font-semibold text-sky-700 mb-2">🔴 רץ עכשיו ({live.length})</div>
          {live.map(r => <LiveRun key={r.id} r={r} />)}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 mb-4">
        <div className="text-sm font-semibold mb-2">🔎 חיפושי כתובות · זרימת נתונים ({searches.length})</div>
        <p className="text-xs text-slate-500 mb-3">כל חיפוש כתובת — כולל פגיעות מטמון. הזרימה: כתובת ← גוש/תכנית ← מקור (מטמון/טרי) ← AI ← כלכלה ← ציון.</p>
        <div className="max-h-[420px] overflow-y-auto">
          {searches.length === 0 ? <div className="text-sm text-slate-400 py-3">אין חיפושים עדיין.</div>
            : searches.map(s => <SearchFlow key={s.id} s={s} />)}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="סך שליפות" value={kpis.total} icon={<Server size={18} />} tone="primary" index={0} />
        <KpiCard label="הושלמו" value={kpis.success} icon={<CheckCircle2 size={18} />} tone="success" index={1} />
        <KpiCard label="עם שומה כלכלית" value={kpis.econ} icon={<Coins size={18} />} tone="primary" index={2} />
        <KpiCard label="מסמכים שנקראו" value={kpis.docs} icon={<FileStack size={18} />} tone="neutral" index={3} />
      </div>

      <DataTable<Run>
        columns={columns}
        data={rows}
        loading={list.isLoading}
        csvName="mavat-pipeline-runs"
        searchPlaceholder="חיפוש לפי כתובת / תכנית…"
        emptyTitle="אין שליפות עדיין"
        emptyBody="ברגע שתורץ בדיקת כדאיות על כתובת, ה-VPN ישלוף את מסמכי התכנית והתהליך יופיע כאן בזמן אמת."
      />
    </div>
  )
}
