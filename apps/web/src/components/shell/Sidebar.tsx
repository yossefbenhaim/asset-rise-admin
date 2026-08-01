import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Home,
  Mail,
  Inbox,
  Users,
  Building2,
  ScrollText,
  Search,
  Briefcase,
  Handshake,
  Gavel,
  Vote,
  ListChecks,
  FileText,
  MessagesSquare,
  Megaphone,
  ClipboardCheck,
  Circle,
  FileBarChart2,
  Activity,
  CreditCard,
  Radar,
  Sparkles,
  FileWarning,
  FileCheck2,
  AlertTriangle,
  MessageCircle,
  Bot,
  Scale,
  Newspaper,
  Server,
  ShieldCheck,
  ChevronDown,
} from 'lucide-react'
import { ADMIN_NAV } from '@/lib/nav/config'
import { useUser, useRoleKeys } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { trpc } from '@/lib/api/trpc'

// lucide-react's typed component is awkward to constrain — `any` here is fine,
// runtime is identical.
const ICONS: Record<string, any> = {
  Home,
  Mail,
  Inbox,
  Users,
  Building2,
  ScrollText,
  Search,
  Briefcase,
  Handshake,
  Gavel,
  Vote,
  ListChecks,
  FileText,
  MessagesSquare,
  Megaphone,
  ClipboardCheck,
  FileBarChart2,
  Activity,
  CreditCard,
  Radar,
  Sparkles,
  FileWarning,
  FileCheck2,
  AlertTriangle,
  MessageCircle,
  Bot,
  Scale,
  Newspaper,
  Server,
  ShieldCheck,
}
function Ic({ name }: { name: string }) {
  const C = ICONS[name] ?? Circle
  return <C size={18} />
}

function initials(name?: string | null): string {
  return (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .map(s => s[0])
    .slice(0, 2)
    .join('')
}

function adminLabel(roleKeys: string[]): string {
  if (roleKeys.includes('admin.super')) return 'מנהל-על'
  if (roleKeys.includes('admin')) return 'מנהל מערכת'
  if (roleKeys.includes('admin.support')) return 'תמיכה'
  if (roleKeys.includes('admin.sales')) return 'מכירות'
  return 'admin'
}

// The "מרכז סוכנים" item expands (chevron) into TEAMS, and each team expands
// into its agents. Agents with a dedicated ops page open it directly:
// Analyzer → בקרת AI (/ai), Wong → אימות מסמכים (/wong), Murdock → לשכה
// משפטית (/legal); everyone else opens their profile page (/agents/:id).
const AGENT_TARGET: Record<string, string> = {
  analyzer: '/ai',
  wong: '/wong',
  murdock: '/legal',
}
const TEAM_ORDER = ['command', 'dev', 'growth', 'marketing', 'ops', 'legal', 'product']
const TEAM_HE: Record<string, string> = {
  command: 'פיקוד',
  dev: 'פיתוח',
  growth: 'צמיחה ומכירות',
  marketing: 'שיווק',
  ops: 'תפעול',
  legal: 'משפטי',
  product: 'מוצר',
}

function AgentsNavItem({ label, onNavigate }: { label: string; onNavigate?: () => void }) {
  const location = useLocation()
  const inAgents = ['/agents', '/ai', '/wong', '/legal'].some(p => location.pathname.startsWith(p))
  const [open, setOpen] = useState(inAgents)
  const [openTeams, setOpenTeams] = useState<Record<string, boolean>>({})
  const list = trpc.agents.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    enabled: open || inAgents,
  })
  const agents = (
    (list.data?.agents ?? []) as Array<{
      id: string
      name: string
      emoji: string | null
      status: string
      team: string
    }>
  ).filter(a => a.status !== 'archived')

  const byTeam: Record<string, typeof agents> = {}
  for (const a of agents) (byTeam[a.team] ??= []).push(a)

  const targetOf = (id: string) => AGENT_TARGET[id] ?? `/agents/${id}`
  // auto-open the team that owns the current route
  const activeTeam = agents.find(a => location.pathname.startsWith(targetOf(a.id)))?.team

  return (
    <div>
      <div className="flex items-stretch">
        <NavLink
          to="/agents"
          end
          onClick={onNavigate}
          className={({ isActive }) => 'sc-side__item flex-1 ' + (isActive ? 'active' : '')}
        >
          <Bot size={18} />
          <span>{label}</span>
        </NavLink>
        <button
          onClick={() => setOpen(v => !v)}
          aria-label={open ? 'סגור רשימת סוכנים' : 'פתח רשימת סוכנים'}
          className="bg-transparent border-0 cursor-pointer px-2 text-sc-text-muted hover:text-sc-text flex items-center"
        >
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="pr-3">
          {TEAM_ORDER.filter(t => byTeam[t]?.length).map(team => {
            const teamOpen = openTeams[team] ?? team === activeTeam
            return (
              <div key={team}>
                <button
                  onClick={() => setOpenTeams(s => ({ ...s, [team]: !teamOpen }))}
                  className="w-full flex items-center gap-1.5 bg-transparent border-0 cursor-pointer px-3 py-1.5 text-[11px] font-extrabold text-sc-text-muted uppercase tracking-wide hover:text-sc-text"
                >
                  <ChevronDown
                    size={11}
                    className={`transition-transform ${teamOpen ? 'rotate-180' : ''}`}
                  />
                  <span>{TEAM_HE[team] ?? team}</span>
                  <span className="font-normal">({byTeam[team].length})</span>
                </button>
                {teamOpen && (
                  <div className="pr-4">
                    {byTeam[team].map(a => (
                      <NavLink
                        key={a.id}
                        to={targetOf(a.id)}
                        onClick={onNavigate}
                        className={({ isActive }) =>
                          'sc-side__item text-[12.5px] py-1.5 ' + (isActive ? 'active' : '')
                        }
                      >
                        <span className="text-[14px] leading-none w-[18px] text-center">
                          {a.emoji ?? '🤖'}
                        </span>
                        <span>{a.name}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {list.isLoading && (
            <div className="text-[11px] text-sc-text-muted px-3 py-1">טוען סוכנים…</div>
          )}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void } = {}) {
  const user = useUser()
  const roleKeys = useRoleKeys()

  const groups = ADMIN_NAV.map(g => ({
    ...g,
    items: g.items.filter(it => !it.requires || it.requires.every(r => can(roleKeys, r))),
  })).filter(g => g.items.length > 0)

  return (
    <aside className="sc-side">
      {user && (
        <div className="sc-side__user sc-side__user--top">
          <div className="av">{initials(user.full_name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="nm"
              style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {user.full_name}
            </div>
            <div className="em">{adminLabel(roleKeys)}</div>
          </div>
        </div>
      )}

      <nav style={{ flex: 1, overflowY: 'auto' }}>
        {groups.map(g => (
          <div key={g.group}>
            <div className="sc-side__group">{g.group}</div>
            {g.items.map(it =>
              it.id === 'agents' ? (
                <AgentsNavItem key={it.id} label={it.label} onNavigate={onNavigate} />
              ) : (
                <NavLink
                  key={it.id}
                  to={it.to}
                  end={it.to === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) => 'sc-side__item ' + (isActive ? 'active' : '')}
                >
                  <Ic name={it.icon} />
                  <span>{it.label}</span>
                </NavLink>
              ),
            )}
          </div>
        ))}
      </nav>
    </aside>
  )
}
