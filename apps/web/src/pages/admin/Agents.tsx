// Agents Center — מרכז סוכנים. Read-only dashboard of the whole OpenClaw agent
// estate: who exists, role, model, version (+why), skills files, documents
// (legal drafts, audits, task cards...), activity timeline, crons and
// registry-vs-reality discrepancies. Data is pushed by the host collector
// (agents-center-sync.py); this page only reads. House design system.
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Bot, Users, FileText, Wrench, AlertTriangle, RefreshCw, Clock, ScrollText, GitBranch, ShieldCheck, ExternalLink } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { DataTable } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'
import { Modal } from '@/components/ui/Modal'
import { Pill } from '@/components/ui/Pill'

const TEAM_LABEL: Record<string, string> = {
  command: 'פיקוד', dev: 'פיתוח', growth: 'צמיחה ומכירות', marketing: 'שיווק',
  ops: 'תפעול', legal: 'משפטי', product: 'מוצר',
}
const TEAM_PILL: Record<string, 'navy' | 'info' | 'gold' | 'success' | 'warning' | 'neutral'> = {
  command: 'navy', dev: 'info', growth: 'gold', marketing: 'warning', ops: 'success', legal: 'neutral', product: 'info',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'פעיל', 'semi-active': 'פעיל חלקית', frozen: 'מוקפא', archived: 'בארכיון', worker: 'Worker',
}
const STATUS_PILL: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'gold'> = {
  active: 'success', 'semi-active': 'gold', frozen: 'info', archived: 'neutral', worker: 'success',
}
const KIND_LABEL: Record<string, string> = {
  identity: 'זהות והגדרה', deliverable: 'תוצר', report: 'דוח', 'legal-draft': 'טיוטה משפטית',
  card: 'כרטיס משימה', ledger: 'לדג׳ר', health: 'בריאות', doc: 'מסמך',
}
const ACT_LABEL: Record<string, string> = {
  approval: 'בקשת אישור', decision: 'החלטה שלך', report: 'דוח', session: 'פעילות מודל', cron: 'ריצה מתוזמנת', health: 'בריאות',
}

type AgentListRow = {
  id: string; name: string; emoji: string | null; team: string; role_title: string
  purpose: string | null; guardrails: string | null; model: string | null; fallback_model: string | null
  status: string; version: string | null; version_why: string | null
  version_history: Array<{ version: string; date: string; note: string }>
  workspace: string | null; telegram_bound: boolean; key_files: string[]; discrepancies: string[]
  sessions_count: number | null; last_activity_at: string | null; synced_at: string
  skills_count: number; docs_count: number; crons_count: number
  [key: string]: unknown
}

const shortModel = (m: string | null) => (m ?? '—').replace('openai-codex/', '').replace('anthropic/', '')
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.valueOf())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const fmtBytes = (n: number | null) => {
  if (!n || n <= 0) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 text-[12px] font-extrabold text-sc-text-muted uppercase tracking-wide mb-2">
        {icon}{title}
      </div>
      {children}
    </div>
  )
}

// Full-content viewer for a skill file / document — monospace, LTR (files are English).
function ContentModal({ title, path, content, loading, onClose }: {
  title: string; path?: string | null; content: string | null; loading: boolean; onClose: () => void
}) {
  return (
    <Modal open onClose={onClose} title={title} subtitle={path ?? undefined} size="xl">
      {loading ? (
        <div className="text-[13px] text-sc-text-secondary p-4">טוען…</div>
      ) : content ? (
        <pre dir="ltr" className="text-[12px] leading-relaxed whitespace-pre-wrap break-words bg-sc-bg rounded-lg p-4 max-h-[65vh] overflow-auto font-mono">
          {content}
        </pre>
      ) : (
        <div className="text-[13px] text-sc-text-secondary p-4">אין תוכן שמור לקובץ זה (ייתכן שהוא גדול מדי או בינארי).</div>
      )}
    </Modal>
  )
}

function AgentDrawer({ agent, onClose }: { agent: AgentListRow | null; onClose: () => void }) {
  const [viewSkill, setViewSkill] = useState<{ id: string; name: string } | null>(null)
  const [viewDoc, setViewDoc] = useState<{ id: string; title: string } | null>(null)

  const detail = trpc.agents.detail.useQuery(
    { id: agent?.id ?? '' },
    { enabled: !!agent, refetchOnWindowFocus: false },
  )
  const skillContent = trpc.agents.skillContent.useQuery(
    { id: viewSkill?.id ?? '' },
    { enabled: !!viewSkill, refetchOnWindowFocus: false },
  )
  const docContent = trpc.agents.docContent.useQuery(
    { id: viewDoc?.id ?? '' },
    { enabled: !!viewDoc, refetchOnWindowFocus: false },
  )

  if (!agent) return <Drawer open={false} onClose={onClose} />
  const d = detail.data

  return (
    <Drawer open onClose={onClose} title={<span>{agent.emoji ? `${agent.emoji} ` : ''}{agent.name}</span>} width={680}>
      <div className="p-4 space-y-1 overflow-y-auto">
        {/* header pills */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Pill kind={STATUS_PILL[agent.status] ?? 'neutral'}>{STATUS_LABEL[agent.status] ?? agent.status}</Pill>
          <Pill kind={TEAM_PILL[agent.team] ?? 'neutral'}>{TEAM_LABEL[agent.team] ?? agent.team}</Pill>
          {agent.version && <Pill kind="navy">v{agent.version}</Pill>}
          <span dir="ltr" className="text-[11px] font-mono text-sc-text-muted">{shortModel(agent.model)}</span>
          {agent.telegram_bound && <Pill kind="gold">Telegram</Pill>}
        </div>

        <Section title="תפקיד ומטרה" icon={<Bot size={13} />}>
          <div className="text-[13px] font-bold text-sc-text mb-1">{agent.role_title}</div>
          <p className="text-[13px] text-sc-text-secondary leading-relaxed m-0">{agent.purpose ?? '—'}</p>
          {agent.guardrails && (
            <div className="mt-2 bg-sc-bg rounded-lg p-3">
              <div className="text-[11px] font-bold text-sc-text-muted mb-1 flex items-center gap-1"><ShieldCheck size={12} /> גבולות והרשאות</div>
              <p className="text-[12px] text-sc-text-secondary whitespace-pre-wrap m-0">{agent.guardrails}</p>
            </div>
          )}
        </Section>

        {agent.discrepancies.length > 0 && (
          <Section title="אי-התאמות שדורשות תשומת לב" icon={<AlertTriangle size={13} />}>
            <div className="space-y-1.5">
              {agent.discrepancies.map((disc, i) => (
                <div key={i} className="flex items-start gap-2 text-[12px] bg-sc-danger/5 border border-sc-danger/20 rounded-lg px-3 py-2">
                  <AlertTriangle size={13} className="text-sc-danger flex-shrink-0 mt-0.5" />
                  <span dir="ltr" className="text-sc-text-secondary text-right" style={{ direction: 'ltr', textAlign: 'left' }}>{disc}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="גרסה ומודל — מי צריך מה ולמה" icon={<GitBranch size={13} />}>
          <div className="bg-sc-bg rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-[13px]">
              <b className="text-sc-text">v{agent.version ?? '?'}</b>
              <span dir="ltr" className="font-mono text-[12px] text-sc-text-secondary">{agent.model ?? '—'}</span>
              {agent.fallback_model && (
                <span className="text-[11px] text-sc-text-muted">fallback: <span dir="ltr" className="font-mono">{shortModel(agent.fallback_model)}</span></span>
              )}
            </div>
            {agent.version_why && <p className="text-[12px] text-sc-text-secondary m-0">{agent.version_why}</p>}
            {agent.version_history.length > 0 && (
              <div className="border-t border-sc-border pt-2 space-y-1">
                {agent.version_history.map((v, i) => (
                  <div key={i} className="text-[12px] text-sc-text-secondary flex items-baseline gap-2">
                    <b className="text-sc-text flex-shrink-0">v{v.version}</b>
                    <span className="text-sc-text-muted flex-shrink-0 sc-num">{v.date}</span>
                    <span>{v.note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>

        <Section title={`ריצות מתוזמנות (${d?.crons.length ?? 0})`} icon={<Clock size={13} />}>
          {d?.crons.length ? (
            <div className="space-y-1.5">
              {d.crons.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-[12px] bg-sc-bg rounded-lg px-3 py-2">
                  <Pill kind={c.enabled ? (c.last_status === 'error' ? 'warning' : 'success') : 'neutral'}>
                    {c.enabled ? (c.last_status === 'error' ? 'שגיאה' : 'פעיל') : 'כבוי'}
                  </Pill>
                  <span dir="ltr" className="font-mono text-[11px] text-sc-text-muted flex-shrink-0">{c.schedule}</span>
                  <span className="text-sc-text-secondary truncate">{c.description}</span>
                </div>
              ))}
            </div>
          ) : <div className="text-[12px] text-sc-text-muted">אין — מופעל לפי דרישה בלבד.</div>}
        </Section>

        <Section title={`סקילים (${d?.skills.length ?? 0})`} icon={<Wrench size={13} />}>
          {d?.skills.length ? (
            <div className="space-y-1.5">
              {d.skills.map(s => (
                <button
                  key={s.id} type="button" onClick={() => setViewSkill({ id: s.id, name: s.name })}
                  className="w-full flex items-center gap-2 text-[12px] bg-sc-bg hover:bg-sc-light-blue/40 transition-colors rounded-lg px-3 py-2 text-right cursor-pointer border-0"
                >
                  <Wrench size={13} className="text-sc-primary flex-shrink-0" />
                  <span dir="ltr" className="font-mono font-bold text-sc-text">{s.name}</span>
                  {s.scan_verdict && <Pill kind={s.scan_verdict === 'pass' ? 'success' : 'warning'}>{s.scan_verdict}</Pill>}
                  <span className="text-sc-text-muted truncate flex-1">{s.description ?? ''}</span>
                  <ExternalLink size={12} className="text-sc-text-muted flex-shrink-0" />
                </button>
              ))}
            </div>
          ) : <div className="text-[12px] text-sc-text-muted">אין סקילים מותקנים.</div>}
        </Section>

        <Section title={`מסמכים ותוצרים (${d?.docs.length ?? 0})`} icon={<FileText size={13} />}>
          {d?.docs.length ? (
            <div className="space-y-1.5">
              {d.docs.map(doc => (
                <button
                  key={doc.id} type="button" onClick={() => setViewDoc({ id: doc.id, title: doc.title })}
                  className="w-full flex items-center gap-2 text-[12px] bg-sc-bg hover:bg-sc-light-blue/40 transition-colors rounded-lg px-3 py-2 text-right cursor-pointer border-0"
                >
                  <FileText size={13} className="text-sc-gold flex-shrink-0" />
                  <span className="font-bold text-sc-text truncate">{doc.title}</span>
                  <Pill kind="neutral">{KIND_LABEL[doc.kind] ?? doc.kind}</Pill>
                  <span className="text-sc-text-muted flex-shrink-0 sc-num">{fmtBytes(doc.size_bytes)}</span>
                  <span className="text-sc-text-muted flex-shrink-0 sc-num">{fmtDate(doc.modified_at)}</span>
                </button>
              ))}
            </div>
          ) : <div className="text-[12px] text-sc-text-muted">אין מסמכים שסונכרנו.</div>}
        </Section>

        <Section title="פעילות אחרונה" icon={<ScrollText size={13} />}>
          {d?.activity.length ? (
            <div className="space-y-1">
              {d.activity.map(a => (
                <div key={a.id} className="flex items-start gap-2 text-[12px] py-1.5 border-b border-sc-border/60 last:border-0">
                  <span className="text-sc-text-muted flex-shrink-0 sc-num w-[76px]">{fmtDate(a.at)}</span>
                  <Pill kind={a.kind === 'decision' ? 'gold' : a.kind === 'approval' ? 'info' : 'neutral'}>
                    {ACT_LABEL[a.kind] ?? a.kind}
                  </Pill>
                  <div className="min-w-0">
                    <div className="text-sc-text font-semibold truncate">{a.title}</div>
                    {a.detail && <div className="text-sc-text-muted truncate">{a.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="text-[12px] text-sc-text-muted">אין פעילות שנרשמה עדיין.</div>}
        </Section>

        {agent.workspace && (
          <div dir="ltr" className="text-[11px] font-mono text-sc-text-muted pt-2 border-t border-sc-border">
            {agent.workspace}
          </div>
        )}
      </div>

      {viewSkill && (
        <ContentModal
          title={viewSkill.name}
          path={skillContent.data?.path}
          content={skillContent.data?.content ?? null}
          loading={skillContent.isLoading}
          onClose={() => setViewSkill(null)}
        />
      )}
      {viewDoc && (
        <ContentModal
          title={viewDoc.title}
          path={docContent.data?.path}
          content={docContent.data?.content ?? null}
          loading={docContent.isLoading}
          onClose={() => setViewDoc(null)}
        />
      )}
    </Drawer>
  )
}

export default function AdminAgents() {
  const [active, setActive] = useState<AgentListRow | null>(null)
  const [teamFilter, setTeamFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const list = trpc.agents.list.useQuery(undefined, { refetchOnWindowFocus: false })
  const stats = trpc.agents.stats.useQuery(undefined, { refetchOnWindowFocus: false })
  const s = stats.data

  const rows = useMemo(() => {
    let r = (list.data?.agents ?? []) as AgentListRow[]
    if (!showArchived) r = r.filter(a => a.status !== 'archived')
    if (teamFilter) r = r.filter(a => a.team === teamFilter)
    return r
  }, [list.data, teamFilter, showArchived])

  const teams = useMemo(
    () => Array.from(new Set(((list.data?.agents ?? []) as AgentListRow[]).map(a => a.team))),
    [list.data],
  )

  const columns: ColumnDef<AgentListRow, unknown>[] = [
    {
      accessorKey: 'name', header: 'סוכן',
      cell: c => (
        <div className="flex items-center gap-2">
          <span className="text-[16px]">{c.row.original.emoji ?? '·'}</span>
          <div>
            <div className="font-bold text-sc-text">{c.row.original.name}</div>
            <div className="text-[11px] text-sc-text-muted">{c.row.original.role_title}</div>
          </div>
        </div>
      ),
    },
    { accessorKey: 'team', header: 'צוות', cell: c => <Pill kind={TEAM_PILL[c.getValue() as string] ?? 'neutral'}>{TEAM_LABEL[c.getValue() as string] ?? String(c.getValue())}</Pill>, size: 90 },
    { accessorKey: 'status', header: 'סטטוס', cell: c => <Pill kind={STATUS_PILL[c.getValue() as string] ?? 'neutral'}>{STATUS_LABEL[c.getValue() as string] ?? String(c.getValue())}</Pill>, size: 80 },
    { accessorKey: 'version', header: 'גרסה', cell: c => <span className="sc-num font-bold text-[12px]">{c.getValue() ? `v${c.getValue()}` : '—'}</span>, size: 60 },
    { accessorKey: 'model', header: 'מודל', cell: c => <span dir="ltr" className="font-mono text-[11px] text-sc-text-secondary">{shortModel(c.getValue() as string | null)}</span>, size: 110 },
    { accessorKey: 'skills_count', header: 'סקילים', cell: c => <span className="sc-num text-[12px]">{c.getValue() as number}</span>, size: 55 },
    { accessorKey: 'docs_count', header: 'מסמכים', cell: c => <span className="sc-num text-[12px]">{c.getValue() as number}</span>, size: 60 },
    {
      accessorKey: 'discrepancies', header: 'התראות',
      cell: c => {
        const n = (c.getValue() as string[]).length
        return n > 0
          ? <span className="inline-flex items-center gap-1 text-sc-danger text-[12px] font-bold"><AlertTriangle size={12} />{n}</span>
          : <span className="text-sc-text-muted text-[12px]">—</span>
      },
      size: 60,
    },
    { accessorKey: 'last_activity_at', header: 'פעילות אחרונה', cell: c => <span className="sc-num text-[12px] text-sc-text-secondary">{fmtDate(c.getValue() as string | null)}</span>, size: 100 },
  ]

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>מרכז סוכנים · Agents Center</h1>
          <div className="sub">
            כל צוות הסוכנים במקום אחד — תפקידים, גרסאות, סקילים, מסמכים ופעילות.
            {s?.lastSync && <> סונכרן לאחרונה: <b className="sc-num">{fmtDate(s.lastSync)}</b></>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <KpiCard label="סוכנים בצוות" value={s?.total ?? 0} icon={<Bot size={18} />} tone="primary" index={0} />
        <KpiCard label="פעילים" value={s?.active ?? 0} icon={<Users size={18} />} tone="success" index={1} />
        <KpiCard label="סקילים מותקנים" value={s?.skills ?? 0} icon={<Wrench size={18} />} tone="navy" index={2} />
        <KpiCard label="מסמכים ותוצרים" value={s?.docs ?? 0} icon={<FileText size={18} />} tone="gold" index={3} />
        <KpiCard label="אי-התאמות" value={s?.discrepancies ?? 0} icon={<AlertTriangle size={18} />} tone={(s?.discrepancies ?? 0) > 0 ? 'danger' : 'success'} index={4} />
      </div>

      <DataTable<AgentListRow>
        columns={columns}
        data={rows}
        loading={list.isLoading}
        onRowClick={r => setActive(r)}
        searchPlaceholder="חיפוש סוכן / תפקיד…"
        csvName="agents-center"
        pageSize={25}
        emptyTitle="אין נתוני סוכנים"
        emptyBody="הרץ את agents-center-sync.py בשרת כדי לסנכרן את המצבת."
        toolbar={
          <div className="flex items-center gap-2">
            <select
              className="sc-input text-[12px] py-1.5"
              value={teamFilter}
              onChange={e => setTeamFilter(e.target.value)}
            >
              <option value="">כל הצוותים</option>
              {teams.map(t => <option key={t} value={t}>{TEAM_LABEL[t] ?? t}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-[12px] text-sc-text-secondary cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
              הצג ארכיון
            </label>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[12px] text-sc-primary cursor-pointer bg-transparent border-0"
              onClick={() => { list.refetch(); stats.refetch() }}
              title="רענן"
            >
              <RefreshCw size={13} /> רענן
            </button>
          </div>
        }
      />

      <AgentDrawer agent={active} onClose={() => setActive(null)} />
    </div>
  )
}
