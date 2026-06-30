// Data Sources Monitor — health of the platform's data sources.
//
// BEST-EFFORT today: only the AI provider has a real live signal, derived from
// sc_analyzer_jobs (recent done/failed counts + last successful completion +
// average run latency). Every other source returns a sensible default and is
// flagged `instrumented: false` ("pending instrumentation") until the dedicated
// sc_source_health table lands in a later phase.
//
// Read-only monitor → no audit, no mutations. Designed to be polled.
import { router, requireAction } from '../trpc.js'
import type {
  SourceHealth,
  SourceStatus,
  SourcesHealthResponse,
} from '@asset-rise/shared'

// Static catalog of the sources we show. icon = lucide-react component name
// the web maps to a component. Order here is the display order.
const SOURCE_DEFS: Array<{
  id: SourceHealth['id']
  name: string
  description: string
  icon: string
}> = [
  { id: 'govmap',    name: 'GovMap / GIS',        description: 'שכבות מיפוי וקרקע ממשלתיות', icon: 'Map' },
  { id: 'renewal',   name: 'מתחמי התחדשות',        description: 'מתחמי פינוי-בינוי ועיבוי',  icon: 'Building2' },
  { id: 'mavat',     name: 'MAVAT / תב״ע',         description: 'נתוני תכנון וזכויות בנייה',  icon: 'FileText' },
  { id: 'municipal', name: 'נתוני עירייה',          description: 'מידע עירוני ומקומי',        icon: 'Landmark' },
  { id: 'geocode',   name: 'Google Geocoding',     description: 'איתור כתובות וקואורדינטות',  icon: 'MapPin' },
  { id: 'ai',        name: 'ספק AI',               description: 'יצירת סיכומי ניתוח ומחקר',   icon: 'Bot' },
]

// Sources without a live signal yet. Default optimistically to 'active' (no
// evidence of failure) but flag as not-instrumented so the UI marks them.
const PENDING_NOTE = 'ממתין להטמעת ניטור — אין עדיין אות בריאות נשמר'

function pendingSource(def: (typeof SOURCE_DEFS)[number]): SourceHealth {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    status: 'active',
    latencyMs: null,
    errorCount: null,
    lastUpdated: null,
    instrumented: false,
    note: PENDING_NOTE,
  }
}

interface AiJobRow {
  status: string | null
  updated_at: string | null
  created_at: string | null
  completed_at: string | null
}

// Derive the AI provider health from the analyzer jobs the worker runs through
// the AI summary step. Heuristic, surfaced as live-derived in the UI:
//   down     → no successful run in the recent window AND recent failures exist
//   degraded → fail-rate ≥ 25% over the window, or last success > 6h ago
//   active   → otherwise
function deriveAiHealth(rows: AiJobRow[], lastDone: string | null, nowMs: number): SourceHealth {
  const recent = rows ?? []
  const done = recent.filter((r) => r.status === 'done').length
  const failed = recent.filter((r) => r.status === 'failed').length
  const total = done + failed
  const failRate = total > 0 ? failed / total : 0

  // Average run latency over recently-completed jobs (created → completed).
  let latencyMs: number | null = null
  const lat: number[] = []
  for (const r of recent) {
    if (r.status === 'done' && r.created_at && r.completed_at) {
      const a = Date.parse(r.created_at)
      const b = Date.parse(r.completed_at)
      if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) lat.push(b - a)
    }
  }
  if (lat.length) latencyMs = Math.round(lat.reduce((s, x) => s + x, 0) / lat.length)

  const lastDoneMs = lastDone ? Date.parse(lastDone) : NaN
  const staleSuccess = Number.isNaN(lastDoneMs) ? true : nowMs - lastDoneMs > 6 * 60 * 60 * 1000
  const hoursSince = Number.isNaN(lastDoneMs) ? null : Math.round((nowMs - lastDoneMs) / 3_600_000)

  let status: SourceStatus = 'active'
  let note: string
  if (done === 0 && failed > 0) {
    status = 'down'
    note = `אין ריצות מוצלחות בטווח האחרון, ${failed} כשלים`
  } else if (failRate >= 0.25 || (staleSuccess && total > 0)) {
    status = 'degraded'
    note =
      failRate >= 0.25
        ? `שיעור כשלים ${Math.round(failRate * 100)}% (${failed}/${total})`
        : `הריצה המוצלחת האחרונה לפני ${hoursSince ?? '?'} שעות`
  } else if (total === 0) {
    // No jobs at all in the window — nothing to fail on, but no proof of life.
    status = 'active'
    note = 'אין עבודות בטווח האחרון'
  } else {
    status = 'active'
    note = `${done} ריצות מוצלחות${failed ? `, ${failed} כשלים` : ''}`
  }

  return {
    id: 'ai',
    name: 'ספק AI',
    description: 'יצירת סיכומי ניתוח ומחקר',
    icon: 'Bot',
    status,
    latencyMs,
    errorCount: failed,
    lastUpdated: lastDone,
    instrumented: true,
    note,
  }
}

export const sourcesRouter = router({
  // Health snapshot of all platform data sources. Pollable (the page uses
  // refetchInterval). Read-only.
  health: requireAction('admin.sources.view').query(
    async ({ ctx }): Promise<SourcesHealthResponse> => {
      const nowMs = Date.now()
      // Look back 24h for the AI live signal.
      const windowIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()

      const [recentJobsRes, lastDoneRes] = await Promise.all([
        ctx.db
          .from('sc_analyzer_jobs')
          .select('status,updated_at,created_at,completed_at')
          .gte('created_at', windowIso)
          .order('created_at', { ascending: false })
          .limit(200),
        ctx.db
          .from('sc_analyzer_jobs')
          .select('completed_at')
          .eq('status', 'done')
          .order('completed_at', { ascending: false, nullsFirst: false })
          .limit(1),
      ])

      const recentRows = (recentJobsRes.data ?? []) as AiJobRow[]
      const lastDone =
        (lastDoneRes.data?.[0] as { completed_at: string | null } | undefined)?.completed_at ?? null

      const aiHealth = deriveAiHealth(recentRows, lastDone, nowMs)

      // Assemble in catalog order, swapping the live AI row in for its placeholder.
      const sources: SourceHealth[] = SOURCE_DEFS.map((def) =>
        def.id === 'ai' ? aiHealth : pendingSource(def),
      )

      const summary = {
        total: sources.length,
        active: sources.filter((s) => s.status === 'active').length,
        degraded: sources.filter((s) => s.status === 'degraded').length,
        down: sources.filter((s) => s.status === 'down').length,
        instrumented: sources.filter((s) => s.instrumented).length,
      }

      return { sources, summary, now: new Date(nowMs).toISOString() }
    },
  ),
})
