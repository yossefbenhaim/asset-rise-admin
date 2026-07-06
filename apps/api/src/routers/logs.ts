// System Logs — a unified, normalized operational feed for the Control Center.
// There is no dedicated "logs" table; this router MERGES two real sources into
// one LogEntry stream:
//   • sc_audit_log              → severity 'info',  service 'audit'
//       message = action, userId = actor_id, meta = meta, timestamp = created_at
//   • sc_analyzer_jobs (failed) → severity 'error', service 'analyzer'
//       message = error, reportId = research_key, timestamp = updated_at
// Pure read; no audit write (a read-only monitor must not pollute the very log
// it renders).
import { router, requireAction } from '../trpc.js'
import { ListLogsInput, type LogEntry } from '@asset-rise/shared'

interface AuditRow {
  id: string
  actor_id: string | null
  action: string | null
  target_type: string | null
  target_id: string | null
  meta: unknown
  ip: string | null
  created_at: string
}

interface FailedJobRow {
  id: string
  research_key: string | null
  status: string | null
  request: unknown
  error: string | null
  attempts: number | null
  created_at: string
  updated_at: string | null
}

function normalizeAudit(row: AuditRow): LogEntry {
  return {
    id: `audit:${row.id}`,
    severity: 'info',
    service: 'audit',
    reportId: null,
    userId: row.actor_id ?? null,
    actorName: null,
    actorEmail: null,
    actorPhone: null,
    message: row.action?.trim() || 'audit',
    // Carry the structured context the drawer pretty-prints.
    meta: {
      meta: row.meta ?? null,
      target_type: row.target_type ?? null,
      target_id: row.target_id ?? null,
      ip: row.ip ?? null,
    },
    // "מה נשלח" — the action's structured context (target + payload meta).
    request: {
      target_type: row.target_type ?? null,
      target_id: row.target_id ?? null,
      meta: row.meta ?? null,
    },
    // Audit rows record successful actions; there is no separate result.
    response: null,
    timestamp: row.created_at,
  }
}

// The customer app's analyzer request may carry the requesting user's id under
// a few possible keys — reach for it defensively so we can resolve the actor.
function userIdFromRequest(request: unknown): string | null {
  const r = request && typeof request === 'object' ? (request as Record<string, unknown>) : null
  if (!r) return null
  const candidate = r.user_id ?? r.userId ?? r.uid
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
}

function normalizeFailedJob(row: FailedJobRow): LogEntry {
  return {
    id: `job:${row.id}`,
    severity: 'error',
    service: 'analyzer',
    reportId: row.research_key ?? null,
    userId: userIdFromRequest(row.request),
    actorName: null,
    actorEmail: null,
    actorPhone: null,
    message: row.error?.trim() || 'job failed',
    meta: {
      job_id: row.id,
      status: row.status ?? null,
      attempts: row.attempts ?? null,
      request: row.request ?? null,
      error: row.error ?? null,
      created_at: row.created_at,
    },
    // "מה נשלח" — the research request the customer pipeline received.
    request: row.request ?? null,
    // "מה חזר" — the failure payload (error text + job status/attempts).
    response: {
      status: row.status ?? null,
      attempts: row.attempts ?? null,
      error: row.error ?? null,
    },
    // Failures are stamped on updated_at; fall back to created_at defensively.
    timestamp: row.updated_at ?? row.created_at,
  }
}

interface SystemLogRow {
  id: string
  severity: 'error' | 'warning' | 'info'
  service: string | null
  ref: string | null
  message: string | null
  meta: unknown
  created_at: string
}

// sc_system_log — structured analyzer failures (and future warnings/info)
// written best-effort by the customer pipeline (migration 082). Real source.
function normalizeSystemLog(row: SystemLogRow): LogEntry {
  // meta is a free-form jsonb the pipeline writes; pull request/response-ish
  // sub-objects (and a possible user_id) when present, else fall back to meta.
  const m = row.meta && typeof row.meta === 'object' ? (row.meta as Record<string, unknown>) : null
  const req = m?.request ?? m?.input ?? null
  const res = m?.result ?? m?.response ?? m?.error ?? null
  return {
    id: `sys:${row.id}`,
    severity: row.severity,
    service: row.service?.trim() || 'system',
    reportId: row.ref ?? null,
    userId: userIdFromRequest(m) ?? userIdFromRequest(req),
    actorName: null,
    actorEmail: null,
    actorPhone: null,
    message: row.message?.trim() || row.severity,
    meta: row.meta ?? null,
    request: req ?? (m && req == null && res == null ? row.meta : null),
    response: res,
    timestamp: row.created_at,
  }
}

const AUDIT_SELECT = 'id,actor_id,action,target_type,target_id,meta,ip,created_at'
const JOB_SELECT = 'id,research_key,status,request,error,attempts,created_at,updated_at'
const SYS_SELECT = 'id,severity,service,ref,message,meta,created_at'

export const logsRouter = router({
  list: requireAction('admin.logs.list')
    .input(ListLogsInput.optional())
    .query(async ({ ctx, input }): Promise<LogEntry[]> => {
      const severity = input?.severity ?? 'all'
      const q = input?.q?.trim().toLowerCase() || ''
      const limit = input?.limit ?? 200

      // Widen the per-source fetch so the post-merge sort + limit stays fair
      // (one source can't crowd the other out of the window).
      const perSource = Math.min(1000, Math.max(limit, 200))

      // analyzer failures are the only 'error' source; audit is the only 'info'
      // source. Skip a query entirely when the severity filter excludes it.
      const wantAudit = severity === 'all' || severity === 'info'
      const wantJobs = severity === 'all' || severity === 'error'
      // sc_system_log can emit any severity, so it's queried for every filter
      // (narrowed by .eq when a specific severity is requested).
      const sysQuery = ctx.db
        .from('sc_system_log')
        .select(SYS_SELECT)
        .order('created_at', { ascending: false })
        .limit(perSource)
      if (severity !== 'all') sysQuery.eq('severity', severity)

      const [auditRes, jobsRes, sysRes] = await Promise.all([
        wantAudit
          ? ctx.db
              .from('sc_audit_log')
              .select(AUDIT_SELECT)
              .order('created_at', { ascending: false })
              .limit(perSource)
          : Promise.resolve({ data: [] as AuditRow[] }),
        wantJobs
          ? ctx.db
              .from('sc_analyzer_jobs')
              .select(JOB_SELECT)
              .eq('status', 'failed')
              .order('updated_at', { ascending: false, nullsFirst: false })
              .limit(perSource)
          : Promise.resolve({ data: [] as FailedJobRow[] }),
        sysQuery,
      ])

      const merged: LogEntry[] = [
        ...((auditRes.data as AuditRow[] | null) ?? []).map(normalizeAudit),
        ...((jobsRes.data as FailedJobRow[] | null) ?? []).map(normalizeFailedJob),
        ...((sysRes.data as SystemLogRow[] | null) ?? []).map(normalizeSystemLog),
      ]

      // Resolve every distinct actor id → identity in ONE batched query so the
      // table can show WHO acted (name/email) instead of a raw uuid.
      const ids = Array.from(new Set(merged.map(e => e.userId).filter((v): v is string => !!v)))
      if (ids.length) {
        const { data: profiles } = await ctx.db
          .from('sc_profiles')
          .select('id,email,full_name,phone')
          .in('id', ids)
        const byId = new Map<string, ProfileRow>(
          ((profiles as ProfileRow[] | null) ?? []).map(p => [p.id, p]),
        )
        for (const e of merged) {
          if (!e.userId) continue
          const p = byId.get(e.userId)
          if (!p) continue
          e.actorName = p.full_name?.trim() || null
          e.actorEmail = p.email?.trim() || null
          e.actorPhone = p.phone?.trim() || null
        }
      }

      // Search across the message AND the resolved actor (name/email/phone) so
      // an admin can find "all logs for this person" by typing their email.
      const filtered = q
        ? merged.filter(e =>
            [e.message, e.actorName, e.actorEmail, e.actorPhone, e.userId]
              .filter(Boolean)
              .some(v => (v as string).toLowerCase().includes(q)),
          )
        : merged

      filtered.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))

      return filtered.slice(0, limit)
    }),
})

interface ProfileRow {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
}
