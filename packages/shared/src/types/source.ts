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

// ---------------------------------------------------------------------------
// FULL SOURCE CATALOG — the complete list of everything the analyzer connects
// to, grouped, with type + what it feeds. This is a STATIC inventory (mirrors
// ~/silver-castle/apps/api/src/analyzer/sources/*) enriched with live health
// from sc_source_health where a canonical SourceId match exists. Backs the
// expandable "כל המקורות" section in apps/web/src/features/sources/*.

// How we connect to a source.
//   'api'    — live programmatic fetch (GIS/CKAN/ArcGIS/MAVAT REST)
//   'web'    — scraped from a website (firecrawl on municipal pages)
//   'static' — curated/bundled data shipped with the app (JSON / policy tables)
export type SourceConnType = 'api' | 'web' | 'static'

// One entry in the catalog. Decoupled from SourceHealth: a catalog entry is an
// adapter we ship, which MAY map to a canonical health SourceId.
export type CatalogSource = {
  // Stable key (the adapter file name, e.g. 'govmap', 'nadlan_deals').
  key: string
  // Hebrew display name.
  name: string
  // Connection type chip.
  type: SourceConnType
  // Short technical descriptor (e.g. 'GovMap GIS', 'data.gov.il CKAN').
  provider: string
  // Hebrew: what this source feeds into the analysis.
  feeds: string
  // lucide-react icon name (mapped client-side).
  icon: string
  // Canonical health id this adapter rolls up to, if any. Lets the UI show the
  // live status/latency next to the catalog entry. null = no direct health row.
  healthId: SourceId | null
  // For municipal-web: the list of municipalities we have scraped data for.
  // Hebrew city names. Empty for everything else.
  municipalities: string[]
}

// A named group of catalog sources for the grouped catalog UI.
export type CatalogGroup = {
  // Stable group key.
  key: string
  // Hebrew group title.
  title: string
  // Hebrew one-line description of the group.
  subtitle: string
  // lucide-react icon name for the group header.
  icon: string
  sources: CatalogSource[]
}

// Live status of a canonical health id, sent alongside the catalog so the UI
// can pin a status dot next to each entry that maps to a health row.
export type CatalogLiveStatus = {
  status: SourceStatus
  instrumented: boolean
  latencyMs: number | null
  lastUpdated: string | null
}

// Payload returned by sources.catalog().
export interface SourcesCatalogResponse {
  groups: CatalogGroup[]
  // Live status keyed by SourceId (only canonical health ids that have a signal).
  live: Partial<Record<SourceId, CatalogLiveStatus>>
  // Counts for the catalog header.
  summary: {
    total: number
    api: number
    web: number
    static: number
    municipalities: number
  }
  now: string
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
