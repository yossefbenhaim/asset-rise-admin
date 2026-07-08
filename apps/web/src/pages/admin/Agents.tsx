// Agents Center — מרכז סוכנים. Overview of the whole OpenClaw agent estate as
// clickable cards; every agent has its own page (/agents/:id) with the full
// profile — the sidebar's expandable "מרכז סוכנים" lists them as sub-tabs.
// Data is pushed by the host collector (agents-center-sync.py).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  Users,
  FileText,
  Wrench,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  Clock,
} from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { Pill } from '@/components/ui/Pill'
import {
  TEAM_LABEL,
  TEAM_PILL,
  STATUS_LABEL,
  STATUS_PILL,
  shortModel,
  fmtDate,
  type AgentListRow,
} from '@/features/agents/meta'

function AgentCard({ agent, onOpen }: { agent: AgentListRow; onOpen: () => void }) {
  const pendingModel = agent.model_config?.status === 'pending'
  return (
    <button
      onClick={onOpen}
      className="sc-card p-4 text-right cursor-pointer border-0 hover:shadow-md transition-shadow flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <span className="text-[20px] leading-none">{agent.emoji ?? '🤖'}</span>
        <span className="text-[14px] font-black text-sc-text truncate">{agent.name}</span>
        <span className="mr-auto flex items-center gap-1.5">
          <Pill kind={STATUS_PILL[agent.status] ?? 'neutral'}>
            {STATUS_LABEL[agent.status] ?? agent.status}
          </Pill>
          <ChevronLeft size={15} className="text-sc-text-muted" />
        </span>
      </div>
      <div className="text-[12px] text-sc-text-secondary leading-snug min-h-[32px]">
        {agent.role_title}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Pill kind={TEAM_PILL[agent.team] ?? 'neutral'}>
          {TEAM_LABEL[agent.team] ?? agent.team}
        </Pill>
        <span dir="ltr" className="text-[11px] font-mono text-sc-text-muted">
          {shortModel(agent.model)}
        </span>
        {pendingModel && <Pill kind="warning">מודל ממתין להחלה</Pill>}
        {agent.discrepancies.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-sc-danger">
            <AlertTriangle size={11} /> {agent.discrepancies.length}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-sc-text-muted border-t border-sc-border/60 pt-2">
        <span className="inline-flex items-center gap-1">
          <Wrench size={11} /> {agent.skills_count} סקילים
        </span>
        <span className="inline-flex items-center gap-1">
          <FileText size={11} /> {agent.docs_count} מסמכים
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={11} /> {agent.crons_count} מתוזמנות
        </span>
        <span className="mr-auto sc-num">{fmtDate(agent.last_activity_at)}</span>
      </div>
    </button>
  )
}

export default function AdminAgents() {
  const navigate = useNavigate()
  const [teamFilter, setTeamFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const list = trpc.agents.list.useQuery(undefined, { refetchOnWindowFocus: false })
  const stats = trpc.agents.stats.useQuery(undefined, { refetchOnWindowFocus: false })
  const s = stats.data

  const agents = useMemo(() => {
    let rows = (list.data?.agents ?? []) as AgentListRow[]
    if (!showArchived) rows = rows.filter(a => a.status !== 'archived')
    if (teamFilter) rows = rows.filter(a => a.team === teamFilter)
    return rows
  }, [list.data, teamFilter, showArchived])

  const teams = useMemo(
    () => [...new Set(((list.data?.agents ?? []) as AgentListRow[]).map(a => a.team))],
    [list.data],
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>מרכז סוכנים · Agents Center</h1>
          <div className="sub">
            כל צוות הסוכנים — לחיצה על סוכן פותחת את העמוד המלא שלו.
            {s?.lastSync && (
              <>
                {' '}
                סונכרן לאחרונה: <b className="sc-num">{fmtDate(s.lastSync)}</b>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <KpiCard
          label="סוכנים בצוות"
          value={s?.total ?? 0}
          icon={<Bot size={18} />}
          tone="primary"
          index={0}
        />
        <KpiCard
          label="פעילים"
          value={s?.active ?? 0}
          icon={<Users size={18} />}
          tone="success"
          index={1}
        />
        <KpiCard
          label="סקילים מותקנים"
          value={s?.skills ?? 0}
          icon={<Wrench size={18} />}
          tone="navy"
          index={2}
        />
        <KpiCard
          label="מסמכים ותוצרים"
          value={s?.docs ?? 0}
          icon={<FileText size={18} />}
          tone="gold"
          index={3}
        />
        <KpiCard
          label="אי-התאמות"
          value={s?.discrepancies ?? 0}
          icon={<AlertTriangle size={18} />}
          tone={(s?.discrepancies ?? 0) > 0 ? 'danger' : 'success'}
          index={4}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <select
          className="sc-input text-[12px] py-1.5"
          value={teamFilter}
          onChange={e => setTeamFilter(e.target.value)}
        >
          <option value="">כל הצוותים</option>
          {teams.map(t => (
            <option key={t} value={t}>
              {TEAM_LABEL[t] ?? t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-sc-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
          />
          הצג ארכיון
        </label>
        {list.isFetching && <RefreshCw size={13} className="text-sc-text-muted animate-spin" />}
      </div>

      {list.isLoading ? (
        <div className="sc-card p-6 text-[13px] text-sc-text-secondary">טוען סוכנים…</div>
      ) : agents.length === 0 ? (
        <div className="sc-card p-6 text-[13px] text-sc-text-secondary">
          אין נתוני סוכנים — הרץ את agents-center-sync.py בשרת כדי לסנכרן.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {agents.map(a => (
            <AgentCard key={a.id} agent={a} onOpen={() => navigate(`/agents/${a.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}
