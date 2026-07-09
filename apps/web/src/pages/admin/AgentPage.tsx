// Per-agent page (/agents/:agentId) — the full profile of one OpenClaw agent:
// identity, model routing, guardrails, version history, crons, skills, docs
// and activity. Everything that used to live in the Agents Center drawer, as a
// standalone page so every agent has its own tab (expandable in the sidebar).
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Wrench,
  AlertTriangle,
  Clock,
  ScrollText,
  GitBranch,
  ShieldCheck,
  ExternalLink,
  Scale,
  FileText,
  ArrowRight,
  Cpu,
} from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Pill } from '@/components/ui/Pill'
import { ModelPicker } from '@/features/agents/ModelPicker'
import {
  TEAM_LABEL,
  TEAM_PILL,
  STATUS_LABEL,
  STATUS_PILL,
  KIND_LABEL,
  KIND_PILL,
  LEGAL_KINDS,
  ACT_LABEL,
  shortModel,
  fmtDate,
  fmtBytes,
  Section,
  ContentModal,
  type AgentListRow,
} from '@/features/agents/meta'
import { NewsroomPanel } from '@/features/agents/NewsroomPanel'
import { LegalDocView } from './LegalDocView'

// Agents that also own a dedicated ops tab get a shortcut to it.
const DEDICATED_TABS: Record<string, { to: string; label: string }> = {
  murdock: { to: '/legal', label: 'לשכה משפטית — מפת הציות והמסמכים' },
  wong: { to: '/wong', label: 'Wong — אימות מסמכים' },
  analyzer: { to: '/processing', label: 'ניטור עיבוד — ג׳ובים של האנלייזר' },
}

export default function AgentPage() {
  const { agentId = '' } = useParams()
  const [viewSkill, setViewSkill] = useState<{ id: string; name: string } | null>(null)
  const [viewDoc, setViewDoc] = useState<{ id: string; title: string; kind: string } | null>(null)

  const list = trpc.agents.list.useQuery(undefined, { refetchOnWindowFocus: false })
  const detail = trpc.agents.detail.useQuery(
    { id: agentId },
    { enabled: !!agentId, refetchOnWindowFocus: false },
  )
  const skillContent = trpc.agents.skillContent.useQuery(
    { id: viewSkill?.id ?? '' },
    { enabled: !!viewSkill, refetchOnWindowFocus: false },
  )
  const docContent = trpc.agents.docContent.useQuery(
    { id: viewDoc?.id ?? '' },
    { enabled: !!viewDoc, refetchOnWindowFocus: false },
  )

  const row = (list.data?.agents as AgentListRow[] | undefined)?.find(a => a.id === agentId)
  const agent = detail.data?.agent ?? null
  const d = detail.data
  const isLegal = (agent?.team ?? row?.team) === 'legal'
  const dedicated = DEDICATED_TABS[agentId]

  if (detail.isLoading && !agent) {
    return (
      <div className="sc-page">
        <div className="sc-card p-6 text-[13px] text-sc-text-secondary">טוען סוכן…</div>
      </div>
    )
  }
  if (!agent) {
    return (
      <div className="sc-page">
        <div className="sc-card p-6 text-[13px] text-sc-text-secondary">
          הסוכן "{agentId}" לא נמצא.{' '}
          <Link to="/agents" className="text-sc-primary font-bold">
            חזרה למרכז הסוכנים
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <Link
            to="/agents"
            className="inline-flex items-center gap-1 text-[12px] font-bold text-sc-text-muted hover:text-sc-primary mb-1"
          >
            <ArrowRight size={13} /> מרכז הסוכנים
          </Link>
          <h1>
            {agent.emoji ? `${agent.emoji} ` : ''}
            {agent.name}
          </h1>
          <div className="sub">{agent.role_title}</div>
        </div>
      </div>

      {/* identity strip */}
      <div className="sc-card p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Pill kind={STATUS_PILL[agent.status] ?? 'neutral'}>
            {STATUS_LABEL[agent.status] ?? agent.status}
          </Pill>
          <Pill kind={TEAM_PILL[agent.team] ?? 'neutral'}>
            {TEAM_LABEL[agent.team] ?? agent.team}
          </Pill>
          {agent.version && <Pill kind="navy">v{agent.version}</Pill>}
          {agent.telegram_bound && <Pill kind="gold">Telegram</Pill>}
          <span dir="ltr" className="text-[11px] font-mono text-sc-text-muted">
            {shortModel(agent.model)}
          </span>
          {dedicated && (
            <Link
              to={dedicated.to}
              className="inline-flex items-center gap-1 text-[12px] font-bold text-sc-gold hover:underline mr-auto"
            >
              <ExternalLink size={12} /> {dedicated.label}
            </Link>
          )}
        </div>
        {agent.purpose && (
          <p className="text-[13px] text-sc-text-secondary leading-relaxed mt-2 mb-0">
            {agent.purpose}
          </p>
        )}
        {agent.guardrails && (
          <div className="mt-2 flex items-start gap-2 text-[12px] text-sc-text-secondary bg-sc-bg rounded-lg px-3 py-2">
            <ShieldCheck size={13} className="text-sc-success flex-shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{agent.guardrails}</span>
          </div>
        )}
      </div>

      {agent.discrepancies.length > 0 && (
        <Section title="אי-התאמות שדורשות תשומת לב" icon={<AlertTriangle size={13} />}>
          <div className="space-y-1.5">
            {agent.discrepancies.map((disc, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-[12px] bg-sc-danger/5 border border-sc-danger/20 rounded-lg px-3 py-2"
              >
                <AlertTriangle size={13} className="text-sc-danger flex-shrink-0 mt-0.5" />
                <span dir="ltr" style={{ direction: 'ltr', textAlign: 'left' }}>
                  {disc}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* side column — configuration */}
        <div>
          <Section title="מודל הרצה" icon={<Cpu size={13} />}>
            <div className="sc-card p-3">
              <ModelPicker
                agentId={agent.id}
                effectiveModel={agent.model}
                config={row?.model_config ?? null}
              />
            </div>
          </Section>

          <Section title="גרסה — מי צריך מה ולמה" icon={<GitBranch size={13} />}>
            <div className="bg-sc-bg rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-[13px]">
                <b className="text-sc-text">v{agent.version ?? '?'}</b>
                {agent.fallback_model && (
                  <span className="text-[11px] text-sc-text-muted">
                    fallback:{' '}
                    <span dir="ltr" className="font-mono">
                      {shortModel(agent.fallback_model)}
                    </span>
                  </span>
                )}
              </div>
              {agent.version_why && (
                <p className="text-[12px] text-sc-text-secondary m-0">{agent.version_why}</p>
              )}
              {agent.version_history.length > 0 && (
                <div className="border-t border-sc-border pt-2 space-y-1">
                  {agent.version_history.map((v, i) => (
                    <div
                      key={i}
                      className="text-[12px] text-sc-text-secondary flex items-baseline gap-2"
                    >
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
                  <div
                    key={c.id}
                    className="flex items-center gap-2 text-[12px] bg-sc-bg rounded-lg px-3 py-2"
                  >
                    <Pill
                      kind={
                        c.enabled ? (c.last_status === 'error' ? 'warning' : 'success') : 'neutral'
                      }
                    >
                      {c.enabled ? (c.last_status === 'error' ? 'שגיאה' : 'פעיל') : 'כבוי'}
                    </Pill>
                    <span
                      dir="ltr"
                      className="font-mono text-[11px] text-sc-text-muted flex-shrink-0"
                    >
                      {c.schedule}
                    </span>
                    <span className="text-sc-text-secondary truncate">{c.description}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-sc-text-muted">אין — מופעל לפי דרישה בלבד.</div>
            )}
          </Section>

          {agent.workspace && (
            <div dir="ltr" className="text-[11px] font-mono text-sc-text-muted">
              {agent.workspace}
            </div>
          )}
        </div>

        {/* main column — knowledge and output */}
        <div className="lg:col-span-2">
          {agent.id === 'newsroom' && <NewsroomPanel />}

          <Section title={`סקילים (${d?.skills.length ?? 0})`} icon={<Wrench size={13} />}>
            {d?.skills.length ? (
              <div className="space-y-1.5">
                {d.skills.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setViewSkill({ id: s.id, name: s.name })}
                    className="w-full flex items-center gap-2 text-[12px] bg-sc-bg hover:bg-sc-light-blue/40 transition-colors rounded-lg px-3 py-2 text-right cursor-pointer border-0"
                  >
                    <Wrench size={13} className="text-sc-primary flex-shrink-0" />
                    <span dir="ltr" className="font-mono font-bold text-sc-text">
                      {s.name}
                    </span>
                    {s.scan_verdict && (
                      <Pill kind={s.scan_verdict === 'pass' ? 'success' : 'warning'}>
                        {s.scan_verdict}
                      </Pill>
                    )}
                    <span className="text-sc-text-muted truncate flex-1">
                      {s.description ?? ''}
                    </span>
                    <ExternalLink size={12} className="text-sc-text-muted flex-shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-sc-text-muted">אין סקילים מותקנים.</div>
            )}
          </Section>

          <Section
            title={`${isLegal ? 'מסמכים משפטיים וחוזים' : 'מסמכים ותוצרים'} (${d?.docs.length ?? 0})`}
            icon={<FileText size={13} />}
          >
            {d?.docs.length ? (
              <div className="space-y-1.5">
                {d.docs.map(doc => {
                  const emph = LEGAL_KINDS.has(doc.kind)
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setViewDoc({ id: doc.id, title: doc.title, kind: doc.kind })}
                      className={
                        emph
                          ? 'w-full flex items-center gap-2 text-[13px] bg-sc-gold/5 border border-sc-gold/40 hover:bg-sc-gold/10 transition-colors rounded-lg px-3 py-2.5 text-right cursor-pointer shadow-sm'
                          : 'w-full flex items-center gap-2 text-[12px] bg-sc-bg hover:bg-sc-light-blue/40 transition-colors rounded-lg px-3 py-2 text-right cursor-pointer border-0'
                      }
                    >
                      {emph ? (
                        <Scale size={15} className="text-sc-gold flex-shrink-0" />
                      ) : (
                        <FileText size={13} className="text-sc-gold flex-shrink-0" />
                      )}
                      <span
                        className={
                          emph
                            ? 'font-extrabold text-sc-text truncate'
                            : 'font-bold text-sc-text truncate'
                        }
                      >
                        {doc.title}
                      </span>
                      <Pill kind={KIND_PILL[doc.kind] ?? 'neutral'}>
                        {KIND_LABEL[doc.kind] ?? doc.kind}
                      </Pill>
                      <span className="text-sc-text-muted flex-shrink-0 sc-num">
                        {fmtBytes(doc.size_bytes)}
                      </span>
                      <span className="text-sc-text-muted flex-shrink-0 sc-num">
                        {fmtDate(doc.modified_at)}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="text-[12px] text-sc-text-muted">אין מסמכים שסונכרנו.</div>
            )}
          </Section>

          <Section title="פעילות אחרונה" icon={<ScrollText size={13} />}>
            {d?.activity.length ? (
              <div className="space-y-1">
                {d.activity.map(a => (
                  <div
                    key={a.id}
                    className="flex items-start gap-2 text-[12px] py-1.5 border-b border-sc-border/60 last:border-0"
                  >
                    <span className="text-sc-text-muted flex-shrink-0 sc-num w-[76px]">
                      {fmtDate(a.at)}
                    </span>
                    <Pill
                      kind={
                        a.kind === 'decision' ? 'gold' : a.kind === 'approval' ? 'info' : 'neutral'
                      }
                    >
                      {ACT_LABEL[a.kind] ?? a.kind}
                    </Pill>
                    <div className="min-w-0">
                      <div className="text-sc-text font-semibold truncate">{a.title}</div>
                      {a.detail && <div className="text-sc-text-muted truncate">{a.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-sc-text-muted">אין פעילות שנרשמה עדיין.</div>
            )}
          </Section>
        </div>
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
      {viewDoc &&
        (LEGAL_KINDS.has(viewDoc.kind) ? (
          <LegalDocView
            title={viewDoc.title}
            content={docContent.data?.content ?? null}
            loading={docContent.isLoading}
            onClose={() => setViewDoc(null)}
          />
        ) : (
          <ContentModal
            title={viewDoc.title}
            path={docContent.data?.path}
            content={docContent.data?.content ?? null}
            loading={docContent.isLoading}
            onClose={() => setViewDoc(null)}
          />
        ))}
    </div>
  )
}
