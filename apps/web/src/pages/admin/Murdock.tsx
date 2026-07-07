// Legal Office — הלשכה המשפטית. Dedicated tab for Matt Murdock, the in-house
// Israeli-law drafting agent. Three layers: (1) the compliance map — every legal
// requirement that binds Asset Rise, each backed by the exact statute + section
// with a link to the official source so it can be researched; (2) the documents
// Murdock produced, opened in the branded A4 viewer; (3) his skill set and
// self-learning loop. Data is pushed by the host collector; this page only reads.
import { useMemo, useState } from 'react'
import {
  Scale,
  Landmark,
  ExternalLink,
  FileSignature,
  FileText,
  GraduationCap,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { Pill } from '@/components/ui/Pill'
import { Modal } from '@/components/ui/Modal'
import { DomainHeader, type DomainInfo } from '@/features/legal/DomainHeader'
import { LegalDocView } from './LegalDocView'

const SEVERITY_LABEL: Record<string, string> = {
  must: 'חובה בדין',
  should: 'מותנה — לבירור',
  recommended: 'מומלץ',
}
const SEVERITY_PILL: Record<string, 'danger' | 'warning' | 'info'> = {
  must: 'danger',
  should: 'warning',
  recommended: 'info',
}
const STATUS_LABEL: Record<string, string> = {
  missing: 'חסר',
  draft: 'טיוטה קיימת',
  lawyer_review: 'אצל עו״ד',
  approved: 'מאושר',
  not_applicable: 'לא חל עלינו',
  blocked: 'ממתין להחלטתך',
}
const STATUS_PILL: Record<string, 'danger' | 'gold' | 'navy' | 'success' | 'neutral' | 'warning'> =
  {
    missing: 'danger',
    draft: 'gold',
    lawyer_review: 'navy',
    approved: 'success',
    not_applicable: 'neutral',
    blocked: 'warning',
  }
const DONE_STATUSES = new Set(['draft', 'lawyer_review', 'approved', 'not_applicable'])
const LEGAL_KINDS = new Set(['contract', 'legal-draft'])
const KIND_LABEL: Record<string, string> = {
  contract: 'חוזה',
  'legal-draft': 'טיוטה משפטית',
  identity: 'זהות והגדרה',
  doc: 'מסמך',
}

type Requirement = {
  id: string
  domain: string
  title: string
  why: string | null
  law: string
  section: string | null
  source_url: string | null
  severity: string
  status: string
  doc_path: string | null
  notes: string | null
  sort_order: number
  synced_at: string
}
type DocRow = {
  id: string
  agent_id: string
  title: string
  path: string
  kind: string
  size_bytes: number | null
  modified_at: string | null
}
type SkillRow = {
  id: string
  agent_id: string
  name: string
  path: string | null
  description: string | null
  origin: string | null
  scan_verdict: string | null
  status: string
}

const baseName = (p: string | null | undefined) => (p ?? '').split('/').filter(Boolean).pop() ?? ''
const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.valueOf())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

// One requirement card: the demand, why it binds us, the exact legal anchor
// (law + section + official-source link), and the fulfilling document if any.
function RequirementCard({
  req,
  doc,
  onOpenDoc,
}: {
  req: Requirement
  doc: DocRow | null
  onOpenDoc: (doc: DocRow) => void
}) {
  return (
    <div className="sc-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="text-[13.5px] font-bold text-sc-text">{req.title}</div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Pill kind={SEVERITY_PILL[req.severity] ?? 'info'}>
            {SEVERITY_LABEL[req.severity] ?? req.severity}
          </Pill>
          <Pill kind={STATUS_PILL[req.status] ?? 'neutral'}>
            {STATUS_LABEL[req.status] ?? req.status}
          </Pill>
        </div>
      </div>

      {req.why && (
        <p className="text-[12.5px] text-sc-text-secondary leading-relaxed m-0">{req.why}</p>
      )}

      {/* the legal anchor — the law itself links to the official source */}
      <div className="flex items-start gap-2 bg-sc-bg rounded-lg px-3 py-2">
        <Landmark size={14} className="text-sc-gold flex-shrink-0 mt-0.5" />
        <div className="text-[12px] leading-relaxed">
          {req.source_url ? (
            <a
              href={req.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-sc-text underline decoration-sc-gold decoration-2 underline-offset-4 hover:text-sc-gold transition-colors"
            >
              {req.law}
            </a>
          ) : (
            <span className="font-bold text-sc-text">{req.law}</span>
          )}
          {req.section && <span className="text-sc-text-secondary"> · {req.section}</span>}
          {req.source_url && (
            <a
              href={req.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sc-primary font-bold underline underline-offset-2 hover:text-sc-gold transition-colors mr-2"
            >
              <ExternalLink size={11} /> לחקור את החוק במקור
            </a>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        {doc ? (
          <button
            onClick={() => onOpenDoc(doc)}
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-sc-gold hover:underline bg-transparent border-0 p-0 cursor-pointer"
          >
            <FileSignature size={13} /> צפה במסמך (A4 ממותג)
          </button>
        ) : req.doc_path ? (
          <span className="text-[11px] text-sc-text-muted font-mono" dir="ltr">
            {baseName(req.doc_path)}
          </span>
        ) : (
          <span />
        )}
        {req.notes && <span className="text-[11px] text-sc-text-muted">{req.notes}</span>}
      </div>
    </div>
  )
}

function SkillModal({
  skill,
  onClose,
}: {
  skill: { id: string; name: string } | null
  onClose: () => void
}) {
  const content = trpc.agents.skillContent.useQuery(
    { id: skill?.id ?? '' },
    { enabled: !!skill, refetchOnWindowFocus: false },
  )
  if (!skill) return null
  return (
    <Modal
      open
      onClose={onClose}
      title={skill.name}
      subtitle="SKILL.md — הידע שמאט עובד לפיו"
      size="lg"
      icon={<GraduationCap size={18} />}
    >
      {content.isLoading ? (
        <div className="text-[13px] text-sc-text-secondary p-4">טוען…</div>
      ) : (
        <pre className="text-[12px] leading-relaxed whitespace-pre-wrap p-4 m-0 max-h-[62vh] overflow-y-auto">
          {content.data?.content ?? 'אין תוכן.'}
        </pre>
      )}
    </Modal>
  )
}

export default function Murdock() {
  const compliance = trpc.agents.compliance.useQuery(undefined, { refetchOnWindowFocus: false })
  const detail = trpc.agents.detail.useQuery({ id: 'murdock' }, { refetchOnWindowFocus: false })
  const [domainFilter, setDomainFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [viewDoc, setViewDoc] = useState<{ id: string; title: string } | null>(null)
  const [viewSkill, setViewSkill] = useState<{ id: string; name: string } | null>(null)
  const docContent = trpc.agents.docContent.useQuery(
    { id: viewDoc?.id ?? '' },
    { enabled: !!viewDoc, refetchOnWindowFocus: false },
  )

  const reqs = useMemo(
    () => (compliance.data?.requirements ?? []) as Requirement[],
    [compliance.data],
  )
  const docs = useMemo(() => (detail.data?.docs ?? []) as DocRow[], [detail.data])
  const skills = useMemo(() => (detail.data?.skills ?? []) as SkillRow[], [detail.data])
  const agent = detail.data?.agent ?? null

  // Match a requirement's doc_path to Murdock's synced docs by file name.
  const docsByName = useMemo(() => {
    const m = new Map<string, DocRow>()
    for (const d of docs) m.set(baseName(d.path), d)
    return m
  }, [docs])

  const domainInfo = useMemo(() => {
    const m = new Map<string, DomainInfo>()
    for (const d of (compliance.data?.domains ?? []) as DomainInfo[]) m.set(d.name, d)
    return m
  }, [compliance.data])

  const domains = useMemo(() => [...new Set(reqs.map(r => r.domain))], [reqs])
  const filtered = reqs.filter(
    r =>
      (domainFilter === 'all' || r.domain === domainFilter) &&
      (statusFilter === 'all' || r.status === statusFilter),
  )
  const byDomain = useMemo(() => {
    const m = new Map<string, Requirement[]>()
    for (const r of filtered) m.set(r.domain, [...(m.get(r.domain) ?? []), r])
    const order = (name: string) => domainInfo.get(name)?.sort_order ?? 99
    return new Map([...m.entries()].sort((a, b) => order(a[0]) - order(b[0])))
  }, [filtered, domainInfo])

  const musts = reqs.filter(r => r.severity === 'must')
  const mustsDone = musts.filter(r => DONE_STATUSES.has(r.status))
  const missing = reqs.filter(r => r.status === 'missing')
  const legalDocs = docs.filter(d => LEGAL_KINDS.has(d.kind))
  const lastSync = reqs[0]?.synced_at ?? null

  const openDoc = (d: DocRow) => setViewDoc({ id: d.id, title: d.title })

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>הלשכה המשפטית · Matt Murdock</h1>
          <div className="sub">
            מפת הציות המלאה של Asset Rise — כל דרישה מעוגנת בחוק ובסעיף במדינת ישראל, עם קישור למקור
            הרשמי לחקירה.
            {lastSync && (
              <>
                {' '}
                סונכרן: <b className="sc-num">{fmtDate(lastSync)}</b>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <KpiCard
          label="דרישות במפה"
          value={reqs.length}
          icon={<Scale size={18} />}
          tone="primary"
          index={0}
        />
        <KpiCard
          label="חובות בדין שטופלו"
          value={`${mustsDone.length}/${musts.length}`}
          icon={<CheckCircle2 size={18} />}
          tone={mustsDone.length === musts.length ? 'success' : 'gold'}
          index={1}
        />
        <KpiCard
          label="חסרים"
          value={missing.length}
          icon={<AlertTriangle size={18} />}
          tone={missing.length > 0 ? 'danger' : 'success'}
          index={2}
        />
        <KpiCard
          label="מסמכים משפטיים"
          value={legalDocs.length}
          icon={<FileSignature size={18} />}
          tone="gold"
          index={3}
        />
        <KpiCard
          label="סקילים (מומחיות)"
          value={skills.length}
          icon={<GraduationCap size={18} />}
          tone="navy"
          index={4}
        />
      </div>

      {/* the lawyer himself */}
      {agent && (
        <div className="sc-card p-4 mb-4">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[15px] font-black text-sc-text">⚖️ {agent.name}</span>
            {agent.version && <Pill kind="navy">v{agent.version}</Pill>}
            <Pill kind="success">פעיל</Pill>
            <Pill kind="gold">עברית בלבד · PDF A4</Pill>
            <Pill kind="info">
              <RefreshCw size={10} /> למידה עצמית + אימות מול מקורות ראשוניים
            </Pill>
          </div>
          <p className="text-[12.5px] text-sc-text-secondary leading-relaxed m-0">
            {agent.purpose}
          </p>
          {agent.guardrails && (
            <div className="mt-2 flex items-start gap-2 text-[12px] text-sc-text-secondary bg-sc-bg rounded-lg px-3 py-2">
              <ShieldCheck size={13} className="text-sc-success flex-shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap">{agent.guardrails}</span>
            </div>
          )}
        </div>
      )}

      {/* filters */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <select
          className="sc-input text-[12px] py-1.5"
          value={domainFilter}
          onChange={e => setDomainFilter(e.target.value)}
        >
          <option value="all">כל התחומים ({reqs.length})</option>
          {domains.map(d => (
            <option key={d} value={d}>
              {d} ({reqs.filter(r => r.domain === d).length})
            </option>
          ))}
        </select>
        <select
          className="sc-input text-[12px] py-1.5"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="all">כל הסטטוסים</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {/* the compliance map, grouped by legal domain */}
      {compliance.isLoading ? (
        <div className="sc-card p-6 text-[13px] text-sc-text-secondary">טוען את מפת הציות…</div>
      ) : reqs.length === 0 ? (
        <div className="sc-card p-6 text-[13px] text-sc-text-secondary">
          מפת הציות טרם סונכרנה. הרץ את agents-center-sync.py בשרת.
        </div>
      ) : (
        [...byDomain.entries()].map(([domain, rows]) => {
          const all = reqs.filter(r => r.domain === domain)
          const done = all.filter(r => DONE_STATUSES.has(r.status)).length
          const mustsMissing = all.filter(
            r => r.severity === 'must' && r.status === 'missing',
          ).length
          return (
            <div key={domain} className="mb-6">
              <DomainHeader
                name={domain}
                info={domainInfo.get(domain) ?? null}
                total={all.length}
                done={done}
                mustsMissing={mustsMissing}
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {rows.map(r => (
                  <RequirementCard
                    key={r.id}
                    req={r}
                    doc={docsByName.get(baseName(r.doc_path)) ?? null}
                    onOpenDoc={openDoc}
                  />
                ))}
              </div>
            </div>
          )
        })
      )}

      {/* every legal document he produced */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <FileText size={15} className="text-sc-gold" />
          <h2 className="text-[14px] font-black text-sc-text m-0">מסמכים משפטיים וחוזים</h2>
          <span className="text-[11px] text-sc-text-muted">
            נפתחים בתצוגת A4 ממותגת · מוכנים לחתימת עו״ד
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {legalDocs.map(d => (
            <button
              key={d.id}
              onClick={() => openDoc(d)}
              className="sc-card p-3 text-right cursor-pointer border-0 flex items-start gap-2.5 hover:shadow-md transition-shadow"
            >
              <FileSignature size={16} className="text-sc-gold flex-shrink-0 mt-0.5" />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold text-sc-text truncate">
                  {d.title.replace(/\.md$/i, '')}
                </span>
                <span className="block text-[11px] text-sc-text-muted">
                  {KIND_LABEL[d.kind] ?? d.kind} · {fmtDate(d.modified_at)}
                </span>
              </span>
            </button>
          ))}
          {legalDocs.length === 0 && !detail.isLoading && (
            <div className="sc-card p-4 text-[12px] text-sc-text-secondary">אין מסמכים עדיין.</div>
          )}
        </div>
      </div>

      {/* the expertise — his skills */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <GraduationCap size={15} className="text-sc-gold" />
          <h2 className="text-[14px] font-black text-sc-text m-0">המומחיות (סקילים)</h2>
          <span className="text-[11px] text-sc-text-muted">לחיצה מציגה את הידע המלא</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {skills.map(s => (
            <button
              key={s.id}
              onClick={() => setViewSkill({ id: s.id, name: s.name })}
              className="sc-card p-3 text-right cursor-pointer border-0 hover:shadow-md transition-shadow"
            >
              <span className="block text-[12.5px] font-bold text-sc-text mb-0.5" dir="ltr">
                {s.name}
              </span>
              <span className="block text-[11.5px] text-sc-text-secondary leading-relaxed">
                {s.description ?? '—'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {viewDoc && (
        <LegalDocView
          title={viewDoc.title}
          content={docContent.data?.content ?? null}
          loading={docContent.isLoading}
          onClose={() => setViewDoc(null)}
        />
      )}
      <SkillModal skill={viewSkill} onClose={() => setViewSkill(null)} />
    </div>
  )
}
