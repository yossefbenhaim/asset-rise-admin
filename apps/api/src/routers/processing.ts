import { router, requireAction } from '../trpc.js'
import {
  PIPELINE_STAGES,
  STAGE_COUNT,
  type ProcessingJob,
  type ProcessingLive,
} from '@asset-rise/shared'

// ── request jsonb helpers ─────────────────────────────────────────────────
// sc_analyzer_jobs.request is the customer app's research request:
// { city, street, number, gush, chelka, lot_sqm, neighborhood, ... }.
// We reach for a few fields defensively (older rows may differ).
function rget(request: unknown): Record<string, any> | null {
  return request && typeof request === 'object' ? (request as Record<string, any>) : null
}

function cityOf(request: unknown): string | null {
  const c = rget(request)?.city
  return typeof c === 'string' && c.trim() ? c.trim() : null
}

// Build a human label "רחוב מספר, עיר" from request, falling back to the
// research_key and finally the id prefix.
function labelOf(request: unknown, researchKey: string | null, id: string): string {
  const r = rget(request)
  if (r) {
    const street = typeof r.street === 'string' ? r.street.trim() : ''
    const number = r.number != null ? String(r.number).trim() : ''
    const city = typeof r.city === 'string' ? r.city.trim() : ''
    const head = [street, number].filter(Boolean).join(' ')
    const full = [head, city].filter(Boolean).join(', ')
    if (full) return full
  }
  if (researchKey && researchKey.trim()) return researchKey.trim()
  return id.slice(0, 8)
}

function elapsedSeconds(startIso: string | null, nowMs: number): number {
  if (!startIso) return 0
  const t = Date.parse(startIso)
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.round((nowMs - t) / 1000))
}

// DERIVED current stage. Per-stage timing isn't persisted yet, so for a
// running job we map elapsed time onto the 7 stages with a rough per-stage
// budget. This is intentionally best-effort and surfaced as such in the UI.
// Done jobs report the final stage; queued/pending/unknown report -1.
const SECONDS_PER_STAGE = 12 // heuristic budget; tune when real timing lands

function deriveStageIndex(status: string, elapsedSec: number): number {
  if (status === 'done') return STAGE_COUNT - 1
  if (status !== 'running') return -1
  const idx = Math.floor(elapsedSec / SECONDS_PER_STAGE)
  // Hold at the last stage while it finishes generating the report.
  return Math.min(idx, STAGE_COUNT - 1)
}

interface JobRow {
  id: string
  research_key: string | null
  status: string | null
  request: unknown
  error: string | null
  attempts: number | null
  created_at: string
  updated_at: string | null
  completed_at: string | null
}

function toProcessingJob(row: JobRow, nowMs: number): ProcessingJob {
  const status = (row.status ?? 'pending') as ProcessingJob['status']
  // Running jobs are timed from updated_at (the worker stamps it on claim);
  // fall back to created_at. Queued jobs show age since created_at.
  const startRef = status === 'running' ? (row.updated_at ?? row.created_at) : row.created_at
  const elapsedSec = elapsedSeconds(startRef, nowMs)
  const stageIndex = deriveStageIndex(status, elapsedSec)
  const failedStage =
    status === 'failed' && stageIndex >= 0 && stageIndex < STAGE_COUNT
      ? PIPELINE_STAGES[stageIndex]
      : null

  return {
    id: row.id,
    research_key: row.research_key ?? null,
    status,
    label: labelOf(row.request, row.research_key, row.id),
    city: cityOf(row.request),
    attempts: row.attempts ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    completed_at: row.completed_at ?? null,
    elapsedSec,
    stageIndex,
    failedStage,
    error: row.error ?? null,
  }
}

const SELECT = 'id,research_key,status,request,error,attempts,created_at,updated_at,completed_at'

export const processingRouter = router({
  // Live snapshot of the research pipeline. Designed to be polled (the page
  // uses refetchInterval: 4000). Pure read; no audit (read-only monitor).
  live: requireAction('admin.processing.view').query(async ({ ctx }): Promise<ProcessingLive> => {
    const nowMs = Date.now()
    // Start of today in the server's local time, as ISO, for "today" KPIs.
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todayIso = startOfToday.toISOString()

    const [
      queueRes,
      runningRes,
      recentDoneRes,
      recentFailedRes,
      doneTodayRes,
      failedTodayRes,
    ] = await Promise.all([
      // Queue: pending jobs, oldest first (next to run).
      ctx.db
        .from('sc_analyzer_jobs')
        .select(SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(50),
      // Running: in-flight jobs, longest-running first (most at-risk).
      ctx.db
        .from('sc_analyzer_jobs')
        .select(SELECT)
        .eq('status', 'running')
        .order('updated_at', { ascending: true })
        .limit(50),
      // Recently completed (last 20).
      ctx.db
        .from('sc_analyzer_jobs')
        .select(SELECT)
        .eq('status', 'done')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(20),
      // Recent failures with their error.
      ctx.db
        .from('sc_analyzer_jobs')
        .select(SELECT)
        .eq('status', 'failed')
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(20),
      // KPI: completed today.
      ctx.db
        .from('sc_analyzer_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'done')
        .gte('completed_at', todayIso),
      // KPI: failed today.
      ctx.db
        .from('sc_analyzer_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('updated_at', todayIso),
    ])

    const queue = (queueRes.data ?? []).map((r) => toProcessingJob(r as JobRow, nowMs))
    const running = (runningRes.data ?? []).map((r) => toProcessingJob(r as JobRow, nowMs))
    const recentDone = (recentDoneRes.data ?? []).map((r) => toProcessingJob(r as JobRow, nowMs))
    const recentFailed = (recentFailedRes.data ?? []).map((r) => toProcessingJob(r as JobRow, nowMs))

    return {
      kpis: {
        inQueue: queue.length,
        processing: running.length,
        doneToday: doneTodayRes.count ?? 0,
        failedToday: failedTodayRes.count ?? 0,
      },
      stages: PIPELINE_STAGES,
      derivedStages: true,
      queue,
      running,
      recentDone,
      recentFailed,
      now: new Date(nowMs).toISOString(),
    }
  }),
})
