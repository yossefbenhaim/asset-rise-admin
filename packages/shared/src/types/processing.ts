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
  // Server clock at fetch time (ISO) — lets the UI tick elapsed locally
  // between 4s polls without drifting from the server's reference.
  now: string
}
