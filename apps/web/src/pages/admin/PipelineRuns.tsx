import { useMemo, useState, type ReactNode } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Server, CheckCircle2, Coins, FileStack, Loader2, Zap, Database, Sparkles, Clock, FileText, EyeOff, MapPin, Timer, Download } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { DataTable } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'

type Doc = { type: string; ai_visible: boolean; pii_removed: number }
type Step = { t: string; msg: string }
type Run = {
  id: string
  created_at: string
  finished_at: string | null
  source: string | null
  job_id: string | null
  plan_number: string | null
  mp_id: string | null
  city: string | null
  street: string | null
  building_number: string | null
  gush: number | null
  zips_downloaded: number | null
  pdfs_extracted: number | null
  docs: Doc[] | null
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
  cache: { label: 'מטמון', cls: 'bg-amber-100 text-amber-700' },
}
const addr = (r: { city: string | null; street: string | null; building_number: string | null }) =>
  [r.city, r.street, r.building_number].filter(Boolean).join(' ') || '—'
const shortTime = (iso: string) => new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// ── shared pill ──────────────────────────────────────────────────────────────
type Tone = 'slate' | 'sky' | 'amber' | 'emerald' | 'violet' | 'rose' | 'dark'
const TONE_CLS: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-500',
  sky: 'bg-sky-100 text-sky-700',
  amber: 'bg-amber-100 text-amber-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  violet: 'bg-violet-100 text-violet-700',
  rose: 'bg-rose-100 text-rose-700',
  dark: 'bg-slate-800 text-white',
}
function Pill({ tone = 'slate', icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] leading-none px-2 py-1 rounded-md font-medium ${TONE_CLS[tone]}`}>
      {icon}{children}
    </span>
  )
}

// ── live card for a run still in progress — updates every few seconds ─────────
function LiveRun({ r }: { r: Run }) {
  const steps = r.steps ?? []
  const last = steps[steps.length - 1]
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 sm:p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Loader2 size={16} className="animate-spin text-sky-600 shrink-0" />
        <span className="font-semibold text-sm">{addr(r)}</span>
        {r.plan_number && <span className="font-mono text-[11px] text-slate-500">{r.plan_number}</span>}
        <span className="ms-auto text-[11px] px-2 py-1 rounded bg-sky-600 text-white font-semibold">{STAGE_HE[r.stage ?? ''] ?? r.stage ?? 'רץ'}</span>
      </div>
      {r.stage === 'downloading' && (
        <div className="text-sm text-sky-800 mt-2">מוריד קבצים: <b className="tabular-nums">{r.downloaded_count ?? 0}</b>{r.last_file ? <span className="text-slate-500 break-all"> · {r.last_file}</span> : null}</div>
      )}
      {last && <div className="text-sm text-slate-700 mt-1">{last.msg}</div>}
      <ol className="mt-2 border-s-2 border-sky-200 ps-3 space-y-0.5">
        {steps.slice(-5).map((s, i) => (
          <li key={i} className="text-[11px] text-slate-500">
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
  has_plan_page: boolean | null; economics_source: string | null; docs_pending: boolean | null
}
const AI_HE: Record<string, string> = { done: 'הושלם', pending: 'ממתין', running: 'רץ', disabled: '—', failed: 'נכשל' }

// A cache-hit search often has no VPN pipeline run — synthesize a minimal run so
// the detail drawer can still open and show its source / score / AI status.
function searchToRun(s: Search): Run {
  return {
    id: s.id, created_at: s.created_at, finished_at: null, source: null, job_id: null,
    plan_number: s.plan_number, mp_id: null, city: s.city, street: s.street, building_number: s.building_number,
    gush: s.gush, zips_downloaded: null, pdfs_extracted: null, docs: null, economics_found: s.has_economics,
    status: 'cache', duration_s: null, stage: null, steps: null, downloaded_count: null, last_file: null,
  }
}

// One search rendered as a compact, mobile-first card. Address + score on top,
// a wrapping row of clearly-labelled status pills below (source / AI / economics).
function SearchCard({ s, onClick }: { s: Search; onClick?: () => void }) {
  const fresh = (s.cache_level ?? '') === 'fresh'
  const aiTone: Tone = s.ai_status === 'done' ? 'emerald' : s.ai_status === 'failed' ? 'rose' : 'sky'
  const meta = [
    s.gush ? `גוש ${s.gush}${s.chelka ? '/' + s.chelka : ''}` : null,
    s.plan_number || null,
  ].filter(Boolean).join(' · ')
  return (
    <div onClick={onClick} className="rounded-lg border border-slate-200 bg-white p-3 cursor-pointer hover:border-sc-primary/50 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{addr(s)}</div>
          <div className="text-[11px] text-slate-400 tabular-nums mt-0.5 truncate">{shortTime(s.created_at)}{meta ? ` · ${meta}` : ''}</div>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums px-2.5 py-1 rounded-lg bg-emerald-600 text-white">{s.score ?? '—'}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {fresh
          ? <Pill tone="sky" icon={<Zap size={11} />}>חיפוש טרי</Pill>
          : <Pill tone="amber" icon={<Database size={11} />}>מטמון {(s.cache_level ?? '').toUpperCase()}</Pill>}
        <Pill tone={aiTone} icon={<Sparkles size={11} />}>AI {AI_HE[s.ai_status ?? ''] ?? s.ai_status ?? '—'}</Pill>
        {s.docs_pending
          ? <Pill tone="sky" icon={<Loader2 size={11} className="animate-spin" />}>מוריד מסמכים</Pill>
          : s.has_economics
            ? <Pill tone="violet" icon={<Coins size={11} />}>נתונים כלכליים · {s.economics_source === 'ai' ? 'AI' : 'מהמסמכים'}</Pill>
            : <Pill tone="slate">אין נתונים כלכליים</Pill>}
      </div>
    </div>
  )
}

// ── detail drawer ─────────────────────────────────────────────────────────
const DOC_TYPE_HE: Record<string, string> = {
  appraisal: 'הערכת שמאי', binui: 'נספח בינוי', balance: 'טבלת איזון והקצאה', traffic: 'נספח תנועה',
  social: 'נספח חברתי', environment: 'נספח סביבה', takanon: 'תקנון', tasrit: 'תשריט',
  other: 'אחר', unknown: 'לא מסווג',
}
const fullTime = (iso: string) => new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const clock = (iso: string) => new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
function fmtDur(sec: number | null | undefined): string {
  if (sec == null) return '—'
  if (sec < 60) return `${sec} שניות`
  const m = Math.floor(sec / 60), s = sec % 60
  return `${m}:${String(s).padStart(2, '0')} דק׳`
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-slate-400 mb-0.5">{label}</div>
      <div className="text-sm text-slate-800 break-words">{children}</div>
    </div>
  )
}
function DBlock({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3.5">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 mb-3">{icon}{title}</h3>
      {children}
    </section>
  )
}

function RunDetail({ run, search, onClose }: { run: Run; search?: Search; onClose: () => void }) {
  const st = STATUS_HE[run.status ?? 'started'] ?? STATUS_HE.started
  const docs = run.docs ?? []
  const read = docs.filter(d => d.ai_visible)
  const skipped = docs.filter(d => !d.ai_visible)
  const steps = run.steps ?? []
  const fresh = (search?.cache_level ?? '') === 'fresh'
  const econSrc = search?.economics_source === 'ai' ? 'חולצו ע״י AI מהטקסט' : run.economics_found ? 'חולצו מהמסמכים' : null
  return (
    <Drawer open onClose={onClose} width={540} title={
      <span className="flex items-center gap-2">
        <MapPin size={16} className="text-sc-primary" />{addr(run)}
        <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${st.cls}`}>{st.label}</span>
      </span>
    }>
      <div className="space-y-3">
        {/* where the data came from */}
        <DBlock icon={<Database size={14} className="text-sky-600" />} title="מקור הנתונים">
          <div className="grid grid-cols-2 gap-3">
            <Field label="מקור">{run.source === 'ai' ? 'Codex' : 'שרת VPN (MAVAT)'}</Field>
            <Field label="מספר תכנית"><span className="font-mono text-xs">{run.plan_number || '—'}</span></Field>
            <Field label="mp_id"><span className="font-mono text-xs">{run.mp_id || '—'}</span></Field>
            <Field label="גוש / חלקה">{run.gush ?? '—'}{search?.chelka ? ` / ${search.chelka}` : ''}</Field>
            <Field label="מטמון / טרי">{search ? (fresh ? 'חיפוש טרי (חושב עכשיו)' : `מטמון ${(search.cache_level ?? '').toUpperCase()}`) : '—'}</Field>
            <Field label="תיק תכנית (מבא״ת)">{search?.has_plan_page ? 'נסרק ✓' : '—'}</Field>
            <Field label="ציון סופי">{search?.score != null ? <b className="text-emerald-700">{search.score}</b> : '—'}{search?.bucket ? <span className="text-slate-400 text-xs"> · {search.bucket}</span> : ''}</Field>
            <Field label="סטטוס AI">{AI_HE[search?.ai_status ?? ''] ?? '—'}</Field>
          </div>
        </DBlock>

        {/* timing */}
        <DBlock icon={<Timer size={14} className="text-violet-600" />} title="תזמון">
          <div className="grid grid-cols-2 gap-3">
            <Field label="התחיל">{fullTime(run.created_at)}</Field>
            <Field label="הסתיים">{run.finished_at ? fullTime(run.finished_at) : 'עדיין רץ…'}</Field>
            <Field label="משך כולל"><b>{fmtDur(run.duration_s)}</b></Field>
            <Field label="שלב נוכחי">{STAGE_HE[run.stage ?? ''] ?? run.stage ?? '—'}</Field>
          </div>
        </DBlock>

        {/* downloads */}
        <DBlock icon={<Download size={14} className="text-sky-600" />} title="הורדות מ-MAVAT">
          <div className="grid grid-cols-2 gap-3">
            <Field label="קובצי ZIP">{run.zips_downloaded ?? 0}</Field>
            <Field label="קובצי PDF">{run.pdfs_extracted ?? 0}</Field>
            <Field label="נספרו בהורדה">{run.downloaded_count ?? 0}</Field>
            <Field label="נתונים כלכליים">{econSrc ? <span className="text-violet-700 font-medium">{econSrc}</span> : 'לא נמצאו'}</Field>
          </div>
          {run.last_file && <div className="mt-2 text-[11px] text-slate-400 break-all">קובץ אחרון: {run.last_file}</div>}
        </DBlock>

        {/* documents */}
        <DBlock icon={<FileText size={14} className="text-emerald-600" />} title={`מסמכים (${docs.length}) · ${read.length} נקראו · ${skipped.length} דולגו`}>
          {docs.length === 0 ? <div className="text-sm text-slate-400">אין מסמכים.</div> : (
            <ul className="space-y-1.5">
              {docs.map((d, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  {d.ai_visible
                    ? <FileText size={14} className="text-emerald-600 shrink-0" />
                    : <EyeOff size={14} className="text-slate-400 shrink-0" />}
                  <span className="font-medium">{DOC_TYPE_HE[d.type] ?? d.type}</span>
                  {d.ai_visible
                    ? <span className="text-[11px] text-emerald-700">נקרא ל-AI</span>
                    : <span className="text-[11px] text-slate-400">דולג (רגיש)</span>}
                  {d.pii_removed > 0 && <span className="ms-auto text-[11px] text-amber-600">{d.pii_removed} פרטים אישיים הוסרו</span>}
                </li>
              ))}
            </ul>
          )}
        </DBlock>

        {/* full timeline */}
        <DBlock icon={<Clock size={14} className="text-slate-500" />} title={`ציר זמן מלא (${steps.length} שלבים)`}>
          {steps.length === 0 ? <div className="text-sm text-slate-400">אין שלבים מתועדים.</div> : (
            <ol className="border-s-2 border-slate-200 ps-3 space-y-1.5">
              {steps.map((s, i) => {
                const prev = i > 0 ? steps[i - 1] : null
                const gap = prev ? Math.round((new Date(s.t).getTime() - new Date(prev.t).getTime()) / 1000) : 0
                return (
                  <li key={i} className="text-xs text-slate-600">
                    <span className="tabular-nums text-slate-400">{clock(s.t)}</span>
                    {gap > 0 && <span className="tabular-nums text-slate-300"> (+{gap}ש׳)</span>}
                    {' · '}{s.msg}
                  </li>
                )
              })}
            </ol>
          )}
        </DBlock>

        <div className="text-[10px] text-slate-300 font-mono break-all pt-1">run {run.id}{run.job_id ? ` · job ${run.job_id}` : ''}</div>
      </div>
    </Drawer>
  )
}

export default function AdminPipelineRuns() {
  // auto-refresh every 4s so the whole VPN → download → Codex chain updates LIVE
  const list = trpc.pipelineRuns.list.useQuery({ limit: 500 }, { refetchInterval: 4000, refetchOnWindowFocus: true })
  const searchList = trpc.pipelineRuns.searches.useQuery({ limit: 200 }, { refetchInterval: 4000, refetchOnWindowFocus: true })
  const searches = (searchList.data ?? []) as Search[]
  const rows = (list.data ?? []) as Run[]
  const live = rows.filter(r => r.stage && r.stage !== 'done' && r.status === 'started')

  // Row/card click → detail drawer. Match each run to its address search (for
  // cache level / score / AI status) and vice-versa; a cache-hit search with no
  // VPN run is shown from a synthesized run so the drawer still opens.
  const [active, setActive] = useState<{ run: Run; search?: Search } | null>(null)
  const sameAddr = (a: { city: string | null; street: string | null; building_number: string | null }, b: typeof a) => addr(a) === addr(b)
  const openRun = (run: Run) => setActive({ run, search: searches.find(s => sameAddr(s, run) && (!run.plan_number || !s.plan_number || s.plan_number === run.plan_number)) })
  const openSearch = (s: Search) => {
    const run = rows.find(r => sameAddr(r, s) && (!s.plan_number || !r.plan_number || r.plan_number === s.plan_number))
    setActive({ run: run ?? searchToRun(s), search: s })
  }

  const kpis = useMemo(() => ({
    total: rows.length,
    success: rows.filter(r => r.status === 'success').length,
    econ: rows.filter(r => r.economics_found).length,
    docs: rows.reduce((s, r) => s + (r.pdfs_extracted ?? 0), 0),
  }), [rows])

  const columns = useMemo<ColumnDef<Run, unknown>[]>(() => [
    { header: 'זמן', accessorKey: 'created_at', cell: ({ row }) => <span className="tabular-nums text-xs text-slate-500">{shortTime(row.original.created_at)}</span> },
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
    { header: 'נתונים כלכליים', id: 'econ', accessorFn: r => (r.economics_found ? 1 : 0), cell: ({ row }) => row.original.economics_found ? <span className="text-xs px-2 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold">נמצאו ✓</span> : <span className="text-xs text-slate-400">—</span> },
    { header: 'סטטוס', accessorKey: 'status', cell: ({ row }) => { const s = STATUS_HE[row.original.status ?? 'started'] ?? STATUS_HE.started; return <span className={`text-xs px-2 py-0.5 rounded font-semibold ${s.cls}`}>{s.label}</span> } },
    { header: 'משך', accessorKey: 'duration_s', cell: ({ row }) => <span className="tabular-nums text-xs text-slate-500">{row.original.duration_s != null ? `${row.original.duration_s}ש׳` : '—'}</span> },
  ], [])

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>מקורות · שרת VPN (MAVAT)</h1>
        <p className="text-sm text-slate-500">שליפת מסמכי תכנית דרך ה-VPN הישראלי בזמן אמת. מתעדכן אוטומטית · ללא פרטים אישיים.</p>
      </div>

      {/* KPIs first — quick glance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-4">
        <KpiCard label="סך שליפות" value={kpis.total} icon={<Server size={18} />} tone="primary" index={0} />
        <KpiCard label="הושלמו" value={kpis.success} icon={<CheckCircle2 size={18} />} tone="success" index={1} />
        <KpiCard label="עם נתונים כלכליים" value={kpis.econ} icon={<Coins size={18} />} tone="primary" index={2} />
        <KpiCard label="מסמכים שנקראו" value={kpis.docs} icon={<FileStack size={18} />} tone="navy" index={3} />
      </div>

      {/* Live now */}
      {live.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-700 mb-2">
            <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" />רץ עכשיו ({live.length})
          </div>
          <div className="space-y-2.5">{live.map(r => <LiveRun key={r.id} r={r} />)}</div>
        </div>
      )}

      {/* Searches — the main view, as clean cards */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-700">חיפושי כתובות ({searches.length})</h2>
          <span className="flex items-center gap-1 text-[11px] text-slate-400"><Clock size={11} />מתעדכן כל 4 שניות</span>
        </div>
        {searches.length === 0
          ? <div className="rounded-lg border border-dashed border-slate-200 text-sm text-slate-400 py-8 text-center">אין חיפושים עדיין.</div>
          : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[520px] overflow-y-auto pe-0.5">
              {searches.map(s => <SearchCard key={s.id} s={s} onClick={() => openSearch(s)} />)}
            </div>
          )}
      </div>

      {/* Full technical run table — folded away so it doesn't clutter mobile */}
      <details className="rounded-xl border border-slate-200 bg-white group">
        <summary className="cursor-pointer select-none p-4 text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="text-slate-400 group-open:rotate-90 transition-transform">▸</span>
          שליפות VPN — מבט טכני מלא ({rows.length})
        </summary>
        <div className="p-3 pt-0 overflow-x-auto">
          <DataTable<Run>
            columns={columns}
            data={rows}
            loading={list.isLoading}
            onRowClick={openRun}
            csvName="mavat-pipeline-runs"
            searchPlaceholder="חיפוש לפי כתובת / תכנית…"
            emptyTitle="אין שליפות עדיין"
            emptyBody="ברגע שתורץ בדיקת כדאיות על כתובת, ה-VPN ישלוף את מסמכי התכנית והתהליך יופיע כאן."
          />
        </div>
      </details>

      {active && <RunDetail run={active.run} search={active.search} onClose={() => setActive(null)} />}
    </div>
  )
}
