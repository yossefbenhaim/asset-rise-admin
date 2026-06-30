// Data Sources Monitor — health of the external/internal data sources the
// analyzer/customer pipeline depends on. Backs apps/api/src/routers/sources.ts
// and apps/web/src/features/sources/*.
//
// Real health signals now land in the sc_source_health table (the customer
// pipeline writes one row per canonical source: status / latency_ms /
// error_count / last_ok_at / last_error / checked_at). The router builds the
// canonical six-source list from those rows. A source that has no row yet is
// reported as 'down' + `instrumented: false` so the UI can mark it as
// not-yet-reporting rather than faking a healthy default.
//
// The AI provider keeps a SECONDARY cross-derivation from sc_analyzer_jobs
// (done/failed ratios + last completion) — used to enrich its note and fill
// gaps when its persisted row is missing or stale.

// Stable identifiers for each platform data source. Kept in sync with the
// SOURCE_DEFS catalog in the router AND the sc_source_health.source enum.
export type SourceId =
  | 'govmap'      // GovMap / GIS spatial layers
  | 'renewal'     // מתחמי התחדשות עירונית
  | 'mavat'       // MAVAT / תב״ע planning data
  | 'municipal'   // נתוני עירייה
  | 'geocode'     // Geocoding
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
  // Round-trip / processing latency in ms, from sc_source_health.latency_ms
  // (or AI-derived avg run time). null = no measurement available.
  latencyMs: number | null
  // Recent error count attributed to this source (sc_source_health.error_count,
  // or AI-derived failures). null when there is no instrumented signal.
  errorCount: number | null
  // When this source last produced a successful result (ISO) — from
  // sc_source_health.last_ok_at (AI falls back to last analyzer completion).
  // null when unknown.
  lastUpdated: string | null
  // Last error text recorded for this source (sc_source_health.last_error).
  // null when there is none / not instrumented.
  lastError: string | null
  // When this source was last health-checked (sc_source_health.checked_at, ISO).
  // null when the source has no persisted row yet.
  checkedAt: string | null
  // true → status/latency/errors come from a real persisted signal right now.
  // false → no sc_source_health row yet (reported 'down', awaiting first check).
  instrumented: boolean
  // Short Hebrew note (derived diagnostic for instrumented sources, or
  // "ממתין לבדיקה ראשונה" for sources without a row yet).
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
