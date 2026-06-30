// System Logs — a UNIFIED, normalized operational feed for the admin Control
// Center. Backs apps/api/src/routers/logs.ts and apps/web/src/features/logs/*.
//
// There is no single "logs" table. The feed is MERGED + normalized server-side
// from two real sources:
//   • sc_audit_log              → severity 'info',  service 'audit'
//   • sc_analyzer_jobs (failed) → severity 'error', service 'analyzer'
// Both are flattened to the LogEntry shape below and sorted by timestamp desc.
import { z } from 'zod'

export type LogSeverity = 'error' | 'warning' | 'info'

// One normalized log line. `type` (not `interface`) so it structurally
// satisfies the DataTable generic constraint `T extends Record<string, unknown>`.
export type LogEntry = {
  // Stable, source-prefixed id (e.g. "audit:<uuid>" / "job:<uuid>") so the two
  // merged streams never collide on a raw uuid.
  id: string
  severity: LogSeverity
  // Originating subsystem — 'audit' | 'analyzer' (kept open for future sources).
  service: string
  // The failed job's research_key (analyzer) — null for audit rows.
  reportId: string | null
  // The acting admin's id (audit actor_id) — null for system/anonymous rows.
  userId: string | null
  // Human-readable line: the audit action, or the job's error text.
  message: string
  // The raw jsonb payload (audit meta / job request+error) for the drawer.
  meta?: unknown
  timestamp: string
}

// ── Input ──────────────────────────────────────────────────────────────
// All filters optional. `severity` 'all' (or omitted) = no severity filter.
// `q` does a case-insensitive contains over the normalized message. `limit`
// caps the merged result (per-source fetch is widened to keep the merge fair).
export const ListLogsInput = z.object({
  severity: z.enum(['error', 'warning', 'info', 'all']).optional(),
  q: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
})
export type ListLogsInput = z.infer<typeof ListLogsInput>
