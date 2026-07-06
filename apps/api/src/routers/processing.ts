import { router, requireAction } from '../trpc.js'
import {
  PIPELINE_STAGES,
  STAGE_COUNT,
  type ProcessingJob,
  type ProcessingLive,
  type ProcessingRun,
  type ProcessingRunStage,
  type ProcessingSourceHealth,
  type ProcessingTimelineGranularity,
  type ProcessingTimelinePoint,
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

// ── sc_report_runs / sc_source_health helpers ─────────────────────────────

// Coerce the runs.stages jsonb (expected [{stage,ms}]) into a clean typed
// array. Tolerant of older/null rows and stray shapes — returns null when
// there's nothing usable so the UI can hide the breakdown.
function parseRunStages(raw: unknown): ProcessingRunStage[] | null {
  if (!Array.isArray(raw)) return null
  const out: ProcessingRunStage[] = []
  for (const s of raw) {
    if (s && typeof s === 'object') {
      const stage = (s as any).stage
      const ms = (s as any).ms
      if (typeof stage === 'string' && typeof ms === 'number' && Number.isFinite(ms)) {
        out.push({ stage, ms: Math.max(0, Math.round(ms)) })
      }
    }
  }
  return out.length ? out : null
}

// Two-digit, zero-padded helper for compact bucket labels.
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Build a timeline of cold-compute runs over the last `hours` window, bucketed
// by hour (≤48h) or day (longer). Each bucket carries run count + avg duration.
// Empty buckets are emitted so the chart shows true gaps, not a compressed line.
function buildTimeline(
  runs: { created_at: string; duration_ms: number | null }[],
  nowMs: number,
  granularity: ProcessingTimelineGranularity,
  buckets: number,
): ProcessingTimelinePoint[] {
  const stepMs = granularity === 'hour' ? 3_600_000 : 86_400_000
  // Floor "now" to the start of its bucket so edges line up.
  const now = new Date(nowMs)
  if (granularity === 'hour') now.setMinutes(0, 0, 0)
  else now.setHours(0, 0, 0, 0)
  const lastStart = now.getTime()
  const firstStart = lastStart - stepMs * (buckets - 1)

  // Accumulate count + duration sum per bucket index.
  const agg = new Map<number, { count: number; durSum: number; durN: number }>()
  for (const r of runs) {
    const t = Date.parse(r.created_at)
    if (Number.isNaN(t) || t < firstStart) continue
    const idx = Math.floor((t - firstStart) / stepMs)
    if (idx < 0 || idx >= buckets) continue
    const cell = agg.get(idx) ?? { count: 0, durSum: 0, durN: 0 }
    cell.count += 1
    if (typeof r.duration_ms === 'number' && Number.isFinite(r.duration_ms)) {
      cell.durSum += r.duration_ms
      cell.durN += 1
    }
    agg.set(idx, cell)
  }

  const out: ProcessingTimelinePoint[] = []
  for (let i = 0; i < buckets; i++) {
    const startMs = firstStart + i * stepMs
    const d = new Date(startMs)
    const label =
      granularity === 'hour'
        ? `${pad2(d.getHours())}:00`
        : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`
    const cell = agg.get(i)
    out.push({
      bucket: new Date(startMs).toISOString(),
      label,
      count: cell?.count ?? 0,
      avgDurationMs: cell && cell.durN > 0 ? Math.round(cell.durSum / cell.durN) : null,
    })
  }
  return out
}

// How far back the timeline + run history reach, and the bucket grain.
const TIMELINE_GRANULARITY: ProcessingTimelineGranularity = 'hour'
const TIMELINE_BUCKETS = 24 // last 24 hours, one bar per hour

export const processingRouter = router({
  // Live snapshot of the research pipeline. Designed to be polled (the page
  // uses refetchInterval: 4000). Pure read; no audit (read-only monitor).
  live: requireAction('admin.processing.view').query(async ({ ctx }): Promise<ProcessingLive> => {
    const nowMs = Date.now()
    // Start of today in the server's local time, as ISO, for "today" KPIs.
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todayIso = startOfToday.toISOString()

    // Timeline window start (ISO): far enough back to fill TIMELINE_BUCKETS.
    const timelineStepMs = TIMELINE_GRANULARITY === 'hour' ? 3_600_000 : 86_400_000
    const timelineSinceIso = new Date(nowMs - timelineStepMs * TIMELINE_BUCKETS).toISOString()

    const [
      queueRes,
      runningRes,
      recentDoneRes,
      recentFailedRes,
      doneTodayRes,
      failedTodayRes,
      runsRes,
      timelineRunsRes,
      sourcesRes,
      liveRunsRes,
    ] = await Promise.all([
      // Queue: pending jobs, oldest first (next to run).
      ctx.db
        .from('sc_analyzer_jobs')
        .select(SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(50),
      // Running: in-flight AI-research jobs, longest-running first. A 5-minute
      // window drops jobs stuck in 'running' (worker died mid-claim) so they
      // don't ghost as forever-running.
      ctx.db
        .from('sc_analyzer_jobs')
        .select(SELECT)
        .eq('status', 'running')
        .gte('updated_at', new Date(nowMs - 5 * 60_000).toISOString())
        .order('updated_at', { ascending: true })
        .limit(200),
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
      // Real analyzer-compute runs (sc_report_runs) — actual wall-clock times.
      // `stages` is the per-run 3-phase (foundation/free/expensive) breakdown.
      ctx.db
        .from('sc_report_runs')
        .select('id,address_display,status,duration_ms,error,created_at,stages')
        .neq('status', 'processing')
        .order('created_at', { ascending: false })
        .limit(20),
      // Runs for the timeline — just timestamps + duration over the window.
      ctx.db
        .from('sc_report_runs')
        .select('created_at,duration_ms')
        .gte('created_at', timelineSinceIso)
        .order('created_at', { ascending: false })
        .limit(2000),
      // Global last-known source-category health (one row per source).
      ctx.db
        .from('sc_source_health')
        .select('source,status,latency_ms,last_ok_at')
        .order('source', { ascending: true }),
      // In-flight cold computes — runs stamped 'processing' at the start of an
      // evaluate (the customer app's startRun). These are the live "a check is
      // running NOW" items. A short 2-minute window drops orphaned rows from a
      // crashed/restarted/aborted compute that never got its finishRun update,
      // so a finished check never lingers as "running". limit is high so many
      // concurrent runs all show.
      ctx.db
        .from('sc_report_runs')
        .select('id,address_display,created_at')
        .eq('status', 'processing')
        .gte('created_at', new Date(nowMs - 120_000).toISOString())
        .order('created_at', { ascending: true })
        .limit(200),
    ])

    const queue = (queueRes.data ?? []).map(r => toProcessingJob(r as JobRow, nowMs))
    // In-flight cold computes (sc_report_runs status='processing') — the live
    // "a check is running now" items — mapped into the running-job shape so the
    // monitor shows them alongside any in-flight AI-research jobs.
    const liveRunJobs: ProcessingJob[] = ((liveRunsRes.data ?? []) as any[]).map(r => ({
      id: r.id,
      research_key: null,
      status: 'running',
      label: (r.address_display as string | null)?.trim() || 'בדיקת היתכנות',
      city: null,
      attempts: null,
      created_at: r.created_at,
      updated_at: null,
      completed_at: null,
      elapsedSec: elapsedSeconds(r.created_at, nowMs),
      stageIndex: -1,
      failedStage: null,
      error: null,
    }))
    const running = [
      ...liveRunJobs,
      ...(runningRes.data ?? []).map(r => toProcessingJob(r as JobRow, nowMs)),
    ]
    const recentDone = (recentDoneRes.data ?? []).map(r => toProcessingJob(r as JobRow, nowMs))
    const recentFailed = (recentFailedRes.data ?? []).map(r => toProcessingJob(r as JobRow, nowMs))
    // Dedupe by address (keep the latest — rows arrive newest-first) so the same
    // request re-run twice doesn't show as duplicate cards.
    const seenAddr = new Set<string>()
    const recentRuns: ProcessingRun[] = ((runsRes.data ?? []) as any[])
      .filter(r => {
        const k = (r.address_display ?? r.id) as string
        if (seenAddr.has(k)) return false
        seenAddr.add(k)
        return true
      })
      .map(r => ({
        id: r.id,
        addressDisplay: r.address_display ?? null,
        status: r.status,
        durationMs: r.duration_ms ?? null,
        error: r.error ?? null,
        created_at: r.created_at,
        stages: parseRunStages(r.stages),
      }))

    // Global source-category health (last snapshot any cold compute wrote).
    const sources: ProcessingSourceHealth[] = ((sourcesRes.data ?? []) as any[]).map(s => ({
      source: s.source,
      status: s.status ?? 'down',
      latencyMs: s.latency_ms ?? null,
      lastOkAt: s.last_ok_at ?? null,
    }))

    // Runs-over-time timeline (count + avg duration per bucket).
    const timeline = buildTimeline(
      (timelineRunsRes.data ?? []) as { created_at: string; duration_ms: number | null }[],
      nowMs,
      TIMELINE_GRANULARITY,
      TIMELINE_BUCKETS,
    )

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
      recentRuns,
      sources,
      timeline,
      timelineGranularity: TIMELINE_GRANULARITY,
      now: new Date(nowMs).toISOString(),
    }
  }),
})
