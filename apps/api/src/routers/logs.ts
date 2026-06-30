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
    message: row.action?.trim() || 'audit',
    // Carry the structured context the drawer pretty-prints.
    meta: {
      meta: row.meta ?? null,
      target_type: row.target_type ?? null,
      target_id: row.target_id ?? null,
      ip: row.ip ?? null,
    },
    timestamp: row.created_at,
  }
}

function normalizeFailedJob(row: FailedJobRow): LogEntry {
  return {
    id: `job:${row.id}`,
    severity: 'error',
    service: 'analyzer',
    reportId: row.research_key ?? null,
    userId: null,
    message: row.error?.trim() || 'job failed',
    meta: {
      job_id: row.id,
      status: row.status ?? null,
      attempts: row.attempts ?? null,
      request: row.request ?? null,
      error: row.error ?? null,
      created_at: row.created_at,
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
  return {
    id: `sys:${row.id}`,
    severity: row.severity,
    service: row.service?.trim() || 'system',
    reportId: row.ref ?? null,
    userId: null,
    message: row.message?.trim() || row.severity,
    meta: row.meta ?? null,
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

      const filtered = q
        ? merged.filter((e) => e.message.toLowerCase().includes(q))
        : merged

      filtered.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))

      return filtered.slice(0, limit)
    }),
})
