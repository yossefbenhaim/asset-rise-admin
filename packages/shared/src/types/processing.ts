// Processing Monitor — real-time view over the analyzer research pipeline
// (sc_analyzer_jobs). Backs apps/api/src/routers/processing.ts and
// apps/web/src/features/processing/*.
//
// IMPORTANT: per-stage timing is NOT yet persisted. The pipeline runs as one
// opaque async job (status pending → running → done/failed). Until a later
// phase records per-stage timestamps, the UI shows a *derived* current stage
// inferred from elapsed time while running — clearly marked as best-effort.

// The canonical 7-stage pipeline, in order. The UI renders a StageBar from
// this list; the API echoes the same array so both sides stay in lockstep.
export const PIPELINE_STAGES = [
  'כתובת התקבלה',
  'איתור גוש/חלקה',
  'שליפת GIS',
  'בדיקת מתחם',
  'חישוב ניקוד',
  'יצירת AI summary',
  'יצירת דוח',
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]
export const STAGE_COUNT = PIPELINE_STAGES.length

// A single job row, flattened for the monitor. `stageIndex` is the derived
// current stage (0-based into PIPELINE_STAGES); -1 when not started / unknown.
export interface ProcessingJob {
  id: string
  research_key: string | null
  status: 'pending' | 'running' | 'done' | 'failed'
  // Best-effort human label of the property, pulled from request jsonb.
  label: string
  city: string | null
  attempts: number | null
  created_at: string
  updated_at: string | null
  completed_at: string | null
  // Seconds since the job started running (or since created, for queued).
  elapsedSec: number
  // Derived current stage index (0..6) for running/just-finished jobs; -1 when
  // queued or unknown. Marked derived because per-stage timing isn't persisted.
  stageIndex: number
  // The stage label that failed (best-effort), for failed jobs only.
  failedStage: string | null
  error: string | null
}

// The whole live payload. `stages` is the canonical pipeline list so the UI
// never hardcodes it. `derivedStages: true` flags that stageIndex is inferred.
export interface ProcessingLive {
  kpis: {
    inQueue: number
    processing: number
    doneToday: number
    failedToday: number
  }
  stages: readonly string[]
  derivedStages: boolean
  queue: ProcessingJob[]
  running: ProcessingJob[]
  recentDone: ProcessingJob[]
  recentFailed: ProcessingJob[]
  // Real analyzer-compute runs (sc_report_runs) — actual wall-clock durations.
  recentRuns: ProcessingRun[]
  // Global last-known source-category health (sc_source_health). The exact
  // source list per run isn't persisted; this is the latest snapshot any cold
  // compute wrote, so the page shows which categories are healthy / last-reached.
  sources: ProcessingSourceHealth[]
  // Runs-over-time timeline, bucketed by hour or day (see timelineGranularity).
  timeline: ProcessingTimelinePoint[]
  timelineGranularity: ProcessingTimelineGranularity
  // Server clock at fetch time (ISO) — lets the UI tick elapsed locally
  // between 4s polls without drifting from the server's reference.
  now: string
}

// One macro-phase timing for a cold compute. The analyzer records exactly
// three: foundation (geocode/GIS), free (renewal/mavat), expensive
// (municipal/AI). ms is the wall-clock spent in that phase.
export interface ProcessingRunStage {
  stage: 'foundation' | 'free' | 'expensive' | string
  ms: number
}

// A real evaluate-compute record from sc_report_runs (migration 081). Unlike
// ProcessingJob (the AI research queue), these are the actual cold/refresh
// analyzer runs with REAL wall-clock durations. `stages` is the per-run
// 3-phase breakdown (jsonb [{stage,ms}]); null on older rows / failed runs.
export interface ProcessingRun {
  id: string
  addressDisplay: string | null
  status: 'queued' | 'processing' | 'completed' | 'failed'
  durationMs: number | null
  error: string | null
  created_at: string
  stages: ProcessingRunStage[] | null
}

// Global last-known health of one analyzer source category, from
// sc_source_health. Per-run exact source lists aren't stored — this is the
// last snapshot any cold compute wrote, so the monitor shows which source
// categories are currently healthy / when each was last reached.
export interface ProcessingSourceHealth {
  source: string
  status: 'active' | 'down' | string
  latencyMs: number | null
  lastOkAt: string | null
}

// A point on the runs-over-time timeline: one bucket (hour or day) with how
// many runs landed in it and their average duration (ms).
export interface ProcessingTimelinePoint {
  // ISO timestamp of the bucket start.
  bucket: string
  // Short human label for the X axis (e.g. "14:00" or "29/06").
  label: string
  count: number
  avgDurationMs: number | null
}

// Granularity of the timeline buckets.
export type ProcessingTimelineGranularity = 'hour' | 'day'
