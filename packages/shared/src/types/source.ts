// Data Sources Monitor — health of the external/internal data sources the
// analyzer pipeline depends on. Backs apps/api/src/routers/sources.ts and
// apps/web/src/features/sources/*.
//
// IMPORTANT: most sources have NO persisted health signal yet. A dedicated
// sc_source_health table lands in a later phase. Until then we derive what we
// can BEST-EFFORT from existing tables (today only the AI provider, inferred
// from sc_analyzer_jobs done/failed ratios + last completion). Sources without
// a live signal report a sensible default status and are flagged
// `instrumented: false` so the UI can clearly mark them as "pending
// instrumentation".

// Stable identifiers for each platform data source. Kept in sync with the
// SOURCE_DEFS catalog in the router.
export type SourceId =
  | 'govmap'      // GovMap / GIS spatial layers
  | 'renewal'     // מתחמי התחדשות עירונית
  | 'mavat'       // MAVAT / תב״ע planning data
  | 'municipal'   // נתוני עירייה
  | 'geocode'     // Google geocoding
  | 'ai'          // AI provider (analyzer summaries / research)

// Health status for a source. Mirrors the StatusBadge keys active/degraded/down.
export type SourceStatus = 'active' | 'degraded' | 'down'

// One source row for the health grid. Flattened + serializable.
export type SourceHealth = {
  id: SourceId
  // Hebrew display name + short Hebrew description of what it feeds.
  name: string
  description: string
  // lucide-react icon name the UI maps to a component (kept server-side so the
  // catalog is the single source of truth). e.g. 'Map', 'Building2', 'Bot'.
  icon: string
  status: SourceStatus
  // Round-trip / processing latency in ms, when we have a real measurement.
  // null = no measurement available yet.
  latencyMs: number | null
  // Number of recent errors attributed to this source (live-derived sources
  // only). null when not instrumented.
  errorCount: number | null
  // When this source last produced a successful result (ISO), best-effort.
  // null when unknown.
  lastUpdated: string | null
  // true → status/latency/errors are derived from real data right now.
  // false → placeholder defaults; awaiting the sc_source_health table.
  instrumented: boolean
  // Short Hebrew note (e.g. "ממתין להטמעת ניטור" for non-instrumented sources,
  // or a derived diagnostic for live ones).
  note: string | null
}

// The whole sources payload returned by sources.health().
export interface SourcesHealthResponse {
  sources: SourceHealth[]
  // Aggregate counts for the page summary strip.
  summary: {
    total: number
    active: number
    degraded: number
    down: number
    instrumented: number
  }
  // Server clock at fetch time (ISO).
  now: string
}
