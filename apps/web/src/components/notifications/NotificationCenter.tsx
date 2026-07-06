// NotificationCenter — right-side slide-over (reuses Drawer) that surfaces
// operational signals to the admin WITHOUT any new server work: it derives
// everything from existing tRPC queries the admin already runs elsewhere
// (processing.live, analytics.dashboard, reports.list, leads.list).
//
// Permission-aware: each source query is `enabled` only when the current
// admin can run it (matching apps/api/src/routers/* requireAction guards), so
// a sales/support admin never fires a query they'd be rejected for.
//
// The same derivation powers the TopBar unread badge via the exported
// `useNotifCount()` hook — single source of truth, no duplicated logic.
import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, FileBarChart2, Flame, Bell, ChevronLeft } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { useRoleKeys } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { useUi } from '@/lib/store'
import { Drawer } from '@/components/ui/Drawer'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Pill } from '@/components/ui/Pill'
import { timeAgo } from '@/lib/format'

// ── one notification item, source-agnostic ─────────────────────────────────
interface NotifItem {
  id: string
  title: string
  sub?: string | null
  at?: string | null
}

type GroupTone = 'danger' | 'gold' | 'warning'

interface NotifGroup {
  key: string
  label: string
  icon: ReactNode
  tone: GroupTone
  to: string
  count: number
  items: NotifItem[]
}

// Cap per group so the panel never floods; the count still reflects the total.
const PER_GROUP = 6

// Shared derivation: runs the (permission-gated) source queries and folds them
// into grouped notifications. Returns groups + total + a loading flag. Used by
// BOTH the panel and the TopBar badge so they can never drift.
function useNotifications() {
  const roleKeys = useRoleKeys()
  const canProcessing = can(roleKeys, 'admin.processing.view')
  const canDashboard = can(roleKeys, 'admin.dashboard')
  const canReports = can(roleKeys, 'admin.reports.list')
  const canLeads = can(roleKeys, 'admin.leads.list')

  const opts = { refetchOnWindowFocus: false, staleTime: 60_000, retry: false as const }

  const processing = trpc.processing.live.useQuery(undefined, { ...opts, enabled: canProcessing })
  // Dashboard is the fallback source for failure counts when processing.view
  // isn't granted but the admin can still see the dashboard alerts block.
  const dashboard = trpc.analytics.dashboard.useQuery(undefined, {
    ...opts,
    enabled: canDashboard && !canProcessing,
  })
  const reports = trpc.reports.list.useQuery(undefined, { ...opts, enabled: canReports })
  const leads = trpc.leads.list.useQuery({ limit: 200 }, { ...opts, enabled: canLeads })

  const groups = useMemo<NotifGroup[]>(() => {
    const out: NotifGroup[] = []

    // 1) Analysis failures (כשלי ניתוח) — prefer the live monitor; fall back to
    //    the dashboard alerts block when the live query isn't permitted.
    if (canProcessing && processing.data) {
      const failedRuns = processing.data.recentRuns.filter(r => r.status === 'failed')
      const items: NotifItem[] = [
        ...processing.data.recentFailed.map(j => ({
          id: `job:${j.id}`,
          title: j.label,
          sub: j.error ?? j.failedStage ?? 'כשל בעיבוד',
          at: j.updated_at ?? j.created_at,
        })),
        ...failedRuns.map(r => ({
          id: `run:${r.id}`,
          title: r.addressDisplay ?? 'הרצת ניתוח',
          sub: r.error ?? 'כשל בהרצת ניתוח',
          at: r.created_at,
        })),
      ].sort((a, b) => Date.parse(b.at ?? '') - Date.parse(a.at ?? ''))

      if (items.length) {
        out.push({
          key: 'failures',
          label: 'כשלי ניתוח',
          icon: <AlertTriangle size={16} />,
          tone: 'danger',
          to: '/processing',
          count: items.length,
          items: items.slice(0, PER_GROUP),
        })
      }
    } else if (canDashboard && dashboard.data) {
      const a = dashboard.data.alerts
      const items: NotifItem[] = a.recentFailures.map(f => ({
        id: `fail:${f.id}`,
        title: f.research_key ?? 'משימת ניתוח שנכשלה',
        sub: f.error ?? `${f.attempts} ניסיונות`,
        at: f.updated_at,
      }))
      const total = a.failedJobs || items.length
      if (total) {
        out.push({
          key: 'failures',
          label: 'כשלי ניתוח',
          icon: <AlertTriangle size={16} />,
          tone: 'danger',
          to: '/processing',
          count: total,
          items: items.slice(0, PER_GROUP),
        })
      }
    }

    // 2) Fresh high-score reports (דוח ציון גבוה חדש) — completed, score >= 80,
    //    from the last 7 days so the badge reflects "new", not all-time.
    if (canReports && reports.data) {
      const weekAgo = Date.now() - 7 * 86_400_000
      const hot = reports.data
        .filter(
          r =>
            r.status === 'completed' && (r.score ?? 0) >= 80 && Date.parse(r.created_at) >= weekAgo,
        )
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      if (hot.length) {
        out.push({
          key: 'reports',
          label: 'דוחות בציון גבוה',
          icon: <FileBarChart2 size={16} />,
          tone: 'gold',
          to: '/reports',
          count: hot.length,
          items: hot.slice(0, PER_GROUP).map(r => ({
            id: `rep:${r.token}`,
            title: r.address_display ?? r.city ?? 'דוח חדש',
            sub: `ציון ${r.score}${r.paid ? ' · שולם' : ''}`,
            at: r.created_at,
          })),
        })
      }
    }

    // 3) Hot leads awaiting handling (ליד חם לטיפול) — status 'new' (untouched).
    if (canLeads && leads.data) {
      const fresh = leads.data
        .filter(l => l.status === 'new')
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      if (fresh.length) {
        out.push({
          key: 'leads',
          label: 'לידים חמים לטיפול',
          icon: <Flame size={16} />,
          tone: 'warning',
          to: '/leads',
          count: fresh.length,
          items: fresh.slice(0, PER_GROUP).map(l => ({
            id: `lead:${l.id}`,
            title: l.name,
            sub: [l.city, l.phone].filter(Boolean).join(' · ') || null,
            at: l.created_at,
          })),
        })
      }
    }

    return out
  }, [
    canProcessing,
    canDashboard,
    canReports,
    canLeads,
    processing.data,
    dashboard.data,
    reports.data,
    leads.data,
  ])

  const total = groups.reduce((s, g) => s + g.count, 0)

  // "Loading" only counts queries that are actually enabled for this admin.
  const isLoading =
    (canProcessing && processing.isLoading) ||
    (canDashboard && !canProcessing && dashboard.isLoading) ||
    (canReports && reports.isLoading) ||
    (canLeads && leads.isLoading)

  return { groups, total, isLoading }
}

// Lightweight hook for the TopBar bell badge. Re-uses the exact derivation
// above so the number on the bell always matches the panel.
export function useNotifCount(): number {
  return useNotifications().total
}

const toneDot: Record<GroupTone, string> = {
  danger: 'bg-sc-danger',
  gold: 'bg-sc-gold',
  warning: 'bg-sc-warning',
}
const tonePill: Record<GroupTone, 'danger' | 'gold' | 'warning'> = {
  danger: 'danger',
  gold: 'gold',
  warning: 'warning',
}

export function NotificationCenter() {
  const open = useUi(s => s.notifOpen)
  const setNotifOpen = useUi(s => s.setNotifOpen)
  const nav = useNavigate()
  const { groups, total, isLoading } = useNotifications()

  const go = (to: string) => {
    setNotifOpen(false)
    nav(to)
  }

  return (
    <Drawer open={open} onClose={() => setNotifOpen(false)} title="התראות" width={420}>
      {isLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton h={14} w="40%" />
              <Skeleton h={48} rounded="12px" />
              <Skeleton h={48} rounded="12px" />
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={<Bell size={32} />}
          title="הכל רגוע"
          body="אין התראות חדשות כרגע. נעדכן אותך כשיהיה משהו לטפל בו."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(g => (
            <motion.section
              key={g.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              <header className="flex items-center justify-between mb-2">
                <button
                  onClick={() => go(g.to)}
                  className="group flex items-center gap-2 text-sc-text hover:text-sc-primary transition-colors"
                >
                  <span
                    className={`grid place-items-center w-7 h-7 rounded-full text-white ${toneDot[g.tone]}`}
                  >
                    {g.icon}
                  </span>
                  <span className="text-[13px] font-bold">{g.label}</span>
                  <Pill kind={tonePill[g.tone]}>{g.count}</Pill>
                  <ChevronLeft
                    size={14}
                    className="text-sc-text-muted group-hover:text-sc-primary"
                  />
                </button>
              </header>

              <ul className="flex flex-col gap-2">
                {g.items.map(it => (
                  <li key={it.id}>
                    <button
                      onClick={() => go(g.to)}
                      className="w-full text-right bg-sc-bg hover:bg-sc-light-blue border border-sc-border rounded-sc-input px-3 py-2.5 transition-colors"
                    >
                      <div className="text-[13px] font-semibold text-sc-text truncate">
                        {it.title}
                      </div>
                      {it.sub && (
                        <div className="text-[11px] text-sc-text-secondary truncate mt-0.5">
                          {it.sub}
                        </div>
                      )}
                      {it.at && (
                        <div className="text-[10px] text-sc-text-muted mt-1">{timeAgo(it.at)}</div>
                      )}
                    </button>
                  </li>
                ))}
                {g.count > g.items.length && (
                  <li>
                    <button
                      onClick={() => go(g.to)}
                      className="w-full text-center text-[11px] font-semibold text-sc-primary hover:underline py-1"
                    >
                      ועוד {g.count - g.items.length} · צפה בהכל
                    </button>
                  </li>
                )}
              </ul>
            </motion.section>
          ))}
        </div>
      )}
    </Drawer>
  )
}
