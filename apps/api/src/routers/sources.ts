// Data Sources Monitor — health of the platform's data sources.
//
// REAL DATA: the customer pipeline now writes the sc_source_health table, one
// row per canonical source ('govmap'|'renewal'|'mavat'|'municipal'|'geocode'
// |'ai'), with: status ('active'|'degraded'|'down'), latency_ms, error_count,
// last_ok_at, last_error, checked_at. We build the canonical six-source list
// from those rows. A source that has no row yet is reported 'down' +
// instrumented:false ("awaiting first health check") — we no longer fake a
// healthy default.
//
// The AI provider keeps a SECONDARY cross-derivation from sc_analyzer_jobs
// (done/failed ratios + last completion). It enriches the AI note and fills the
// AI row's gaps when its sc_source_health row is missing or stale.
//
// Read-only monitor → no audit, no mutations. Designed to be polled.
import { router, requireAction } from '../trpc.js'
import type {
  CatalogGroup,
  CatalogSource,
  SourceHealth,
  SourceId,
  SourceStatus,
  SourcesHealthResponse,
} from '@asset-rise/shared'

// Static catalog of the sources we show. icon = lucide-react component name
// the web maps to a component. Order here is the display order. Hebrew labels.
const SOURCE_DEFS: Array<{
  id: SourceId
  name: string
  description: string
  icon: string
}> = [
  { id: 'govmap',    name: 'GovMap / GIS',   description: 'שכבות מיפוי וקרקע ממשלתיות', icon: 'Map' },
  { id: 'renewal',   name: 'מתחמי התחדשות',  description: 'מתחמי פינוי-בינוי ועיבוי',  icon: 'Building2' },
  { id: 'mavat',     name: 'MAVAT / תב״ע',   description: 'נתוני תכנון וזכויות בנייה',  icon: 'FileText' },
  { id: 'municipal', name: 'נתוני עירייה',    description: 'מידע עירוני ומקומי',        icon: 'Landmark' },
  { id: 'geocode',   name: 'Geocoding',      description: 'איתור כתובות וקואורדינטות',  icon: 'MapPin' },
  { id: 'ai',        name: 'ספק AI',          description: 'יצירת סיכומי ניתוח ומחקר',   icon: 'Bot' },
]

// One row of sc_source_health as we read it.
interface HealthRow {
  source: string | null
  status: string | null
  latency_ms: number | null
  error_count: number | null
  last_ok_at: string | null
  last_error: string | null
  checked_at: string | null
}

// Whether the source has produced a recent health check. We treat a check
// older than 30 min as stale (the pipeline writes far more often than that).
const STALE_CHECK_MS = 30 * 60 * 1000

const VALID_STATUS = new Set<SourceStatus>(['active', 'degraded', 'down'])
function coerceStatus(s: string | null): SourceStatus {
  return s && VALID_STATUS.has(s as SourceStatus) ? (s as SourceStatus) : 'down'
}

// Build a SourceHealth from a persisted sc_source_health row.
function fromHealthRow(def: (typeof SOURCE_DEFS)[number], row: HealthRow, nowMs: number): SourceHealth {
  const status = coerceStatus(row.status)
  const checkedMs = row.checked_at ? Date.parse(row.checked_at) : NaN
  const stale = Number.isNaN(checkedMs) ? false : nowMs - checkedMs > STALE_CHECK_MS

  let note: string
  if (row.last_error && status !== 'active') {
    note = row.last_error
  } else if (status === 'active') {
    note = stale ? 'תקין — אך הבדיקה האחרונה אינה עדכנית' : 'פעיל ותקין'
  } else if (status === 'degraded') {
    note = 'ביצועים מדורדרים'
  } else {
    note = 'המקור אינו זמין'
  }

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    status,
    latencyMs: row.latency_ms ?? null,
    errorCount: row.error_count ?? null,
    lastUpdated: row.last_ok_at ?? null,
    lastError: row.last_error ?? null,
    checkedAt: row.checked_at ?? null,
    instrumented: true,
    note,
  }
}

// A source that has no sc_source_health row yet → reported down, awaiting its
// first check. Not instrumented so the UI marks it distinctly.
function uninstrumentedSource(def: (typeof SOURCE_DEFS)[number]): SourceHealth {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    status: 'down',
    latencyMs: null,
    errorCount: null,
    lastUpdated: null,
    lastError: null,
    checkedAt: null,
    instrumented: false,
    note: 'ממתין לבדיקה ראשונה — אין עדיין אות בריאות נשמר',
  }
}

interface AiJobRow {
  status: string | null
  updated_at: string | null
  created_at: string | null
  completed_at: string | null
}

// Cross-derived AI signal from analyzer jobs (SECONDARY). Returns a compact
// diagnostic used to enrich the AI row's note and to fill gaps when the
// persisted AI row is missing/stale.
interface AiSignal {
  status: SourceStatus
  latencyMs: number | null
  failed: number
  lastDone: string | null
  note: string
  hasData: boolean
}

function deriveAiSignal(rows: AiJobRow[], lastDone: string | null, nowMs: number): AiSignal {
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
    status = 'active'
    note = 'אין עבודות ניתוח בטווח האחרון'
  } else {
    status = 'active'
    note = `${done} ריצות ניתוח מוצלחות${failed ? `, ${failed} כשלים` : ''}`
  }

  return { status, latencyMs, failed, lastDone, note, hasData: total > 0 }
}

// Merge the persisted AI row (primary) with the analyzer-jobs signal (secondary):
// the persisted row owns status/latency/errors; the jobs signal enriches the
// note and backfills latency / last-success when the persisted row lacks them.
function mergeAi(primary: SourceHealth, signal: AiSignal): SourceHealth {
  return {
    ...primary,
    latencyMs: primary.latencyMs ?? signal.latencyMs,
    lastUpdated: primary.lastUpdated ?? signal.lastDone,
    note: signal.hasData ? `${primary.note} · ${signal.note}` : primary.note,
  }
}

// Build the AI row from ONLY the analyzer-jobs signal when no persisted row
// exists. Marked instrumented (it is a real live-derived signal).
function aiFromSignalOnly(def: (typeof SOURCE_DEFS)[number], signal: AiSignal): SourceHealth {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    status: signal.status,
    latencyMs: signal.latencyMs,
    errorCount: signal.failed,
    lastUpdated: signal.lastDone,
    lastError: null,
    checkedAt: null,
    instrumented: true,
    note: `נגזר מעבודות הניתוח · ${signal.note}`,
  }
}

// ---------------------------------------------------------------------------
// FULL SOURCE CATALOG — the complete inventory of every data source the
// analyzer connects to, grouped. Mirrors the adapter files in
// ~/silver-castle/apps/api/src/analyzer/sources/*. Each entry carries: name,
// connection type ('api'|'web'|'static'), the upstream provider, a Hebrew
// "what it feeds" line, an icon, and the canonical healthId it rolls up to (so
// the UI can pin live health from sc_source_health next to it).
//
// MUNICIPALITIES with scraped municipal-web data (firecrawl on city
// urban-renewal pages):
const MUNICIPAL_CITIES = ['חיפה', 'תל אביב-יפו', 'רמת גן', 'ירושלים']

// Grouped catalog (static). healthId links to the six canonical health rows.
const CATALOG_GROUPS: CatalogGroup[] = [
  {
    key: 'gis',
    title: 'GIS / GovMap',
    subtitle: 'שכבות מיפוי, חלקות והתחדשות עירונית ממערכת GovMap הממשלתית',
    icon: 'Map',
    sources: [
      {
        key: 'govmap',
        name: 'GovMap — מיפוי וחלקות',
        type: 'api',
        provider: 'GovMap GIS',
        feeds: 'גוש/חלקה, גבולות מגרש, שכבות מרחביות ונתוני קרקע',
        icon: 'Map',
        healthId: 'govmap',
        municipalities: [],
      },
      {
        key: 'landuse',
        name: 'ייעודי קרקע',
        type: 'api',
        provider: 'GovMap GIS',
        feeds: 'ייעוד הקרקע במגרש (מגורים/מסחר/תעשייה) לבדיקת התאמה',
        icon: 'LayoutGrid',
        healthId: 'govmap',
        municipalities: [],
      },
      {
        key: 'neighborhood',
        name: 'הקשר שכונתי',
        type: 'api',
        provider: 'GovMap GIS',
        feeds: 'מאפייני הסביבה והשכונה סביב המגרש',
        icon: 'MapPinned',
        healthId: 'govmap',
        municipalities: [],
      },
      {
        key: 'nadlan_deals',
        name: 'עסקאות נדל״ן (נדל"ן)',
        type: 'api',
        provider: 'GovMap מרחבי · קציר דפדפן',
        feeds: 'עסקאות נדל״ן אמיתיות סביב המגרש לחישוב מחירי שוק ורווח יזמי',
        icon: 'Coins',
        healthId: 'govmap',
        municipalities: [],
      },
    ],
  },
  {
    key: 'planning',
    title: 'תכנון — MAVAT / תב״ע',
    subtitle: 'זכויות בנייה ותוכניות סטטוטוריות',
    icon: 'FileText',
    sources: [
      {
        key: 'mavat',
        name: 'MAVAT — מבא״ת / תב״ע',
        type: 'api',
        provider: 'מנהל התכנון (iplan)',
        feeds: 'תוכניות סטטוטוריות, זכויות בנייה ותקנון התב״ע',
        icon: 'FileText',
        healthId: 'mavat',
        municipalities: [],
      },
    ],
  },
  {
    key: 'datagov',
    title: 'data.gov.il — מאגרי מידע ממשלתיים',
    subtitle: 'מאגרי CKAN פתוחים: התחדשות, קבלנים וייעודי קרקע',
    icon: 'Database',
    sources: [
      {
        key: 'datagov',
        name: 'מתחמי התחדשות עירונית',
        type: 'api',
        provider: 'data.gov.il (CKAN)',
        feeds: 'מתחמי פינוי-בינוי ועיבוי לפי עיר, וסטטוס תכנוני',
        icon: 'Building2',
        healthId: 'renewal',
        municipalities: [],
      },
      {
        key: 'buildingsites',
        name: 'מתחמי בנייה',
        type: 'api',
        provider: 'data.gov.il (CKAN)',
        feeds: 'אתרי בנייה פעילים ומתחמים בביצוע באזור',
        icon: 'Construction',
        healthId: 'renewal',
        municipalities: [],
      },
      {
        key: 'registeredcontractors',
        name: 'קבלנים רשומים',
        type: 'api',
        provider: 'data.gov.il (CKAN)',
        feeds: 'רישום קבלנים מוסמכים — אימות יזמים ופעילות באזור',
        icon: 'HardHat',
        healthId: 'renewal',
        municipalities: [],
      },
    ],
  },
  {
    key: 'municipal',
    title: 'אתרי עיריות + Firecrawl',
    subtitle: 'קציר עמודי התחדשות עירונית מאתרי הרשויות באמצעות Firecrawl',
    icon: 'Landmark',
    sources: [
      {
        key: 'municipal_web',
        name: 'נתוני עירייה (קציר אתר)',
        type: 'web',
        provider: 'Firecrawl scrape',
        feeds: 'מידע מקומי על התחדשות עירונית הנקצר מעמודי הרשויות',
        icon: 'Landmark',
        healthId: 'municipal',
        municipalities: MUNICIPAL_CITIES,
      },
      {
        key: 'municipal_sources',
        name: 'קטלוג מקורות עירוניים (Seed)',
        type: 'static',
        provider: 'קטלוג כתובות פנימי',
        feeds: 'רשימת כתובות ה-URL שמהן Firecrawl קוצר את נתוני הרשויות',
        icon: 'Link',
        healthId: 'municipal',
        municipalities: [],
      },
    ],
  },
  {
    key: 'transit',
    title: 'תחבורה — רכבת קלה',
    subtitle: 'תחנות ומסדרונות תחבורה ציבורית',
    icon: 'TrainFront',
    sources: [
      {
        key: 'lrt',
        name: 'תחנות רכבת קלה',
        type: 'static',
        provider: 'JSON מובנה',
        feeds: 'קרבת המגרש לתחנות רכבת קלה — מקדם נגישות ופוטנציאל',
        icon: 'TrainFront',
        healthId: null,
        municipalities: [],
      },
    ],
  },
  {
    key: 'arcgis',
    title: 'תל אביב — ArcGIS',
    subtitle: 'נתוני היתרי בנייה ייעודיים לעיר תל אביב',
    icon: 'Building',
    sources: [
      {
        key: 'ta_arcgis',
        name: 'היתרי בנייה — תל אביב',
        type: 'api',
        provider: 'Tel-Aviv ArcGIS',
        feeds: 'היתרי בנייה ופעילות תכנונית בתל אביב-יפו',
        icon: 'Building',
        healthId: 'municipal',
        municipalities: [],
      },
    ],
  },
  {
    key: 'policy',
    title: 'מדיניות ותקנים',
    subtitle: 'טבלאות מדיניות מובנות ששמשות את מנוע הניקוד',
    icon: 'SlidersHorizontal',
    sources: [
      {
        key: 'density_policy',
        name: 'מדיניות צפיפות',
        type: 'static',
        provider: 'טבלת מדיניות אצורה',
        feeds: 'תקני צפיפות אזוריים לחישוב פוטנציאל יחידות הדיור',
        icon: 'SlidersHorizontal',
        healthId: null,
        municipalities: [],
      },
    ],
  },
  {
    key: 'ai',
    title: 'מנוע AI',
    subtitle: 'יצירת סיכומי הניתוח והמחקר',
    icon: 'Bot',
    sources: [
      {
        key: 'ai_worker',
        name: 'ספק AI — עובד Codex',
        type: 'api',
        provider: 'Codex worker (sc_analyzer_jobs)',
        feeds: 'סיכומי ניתוח, פאנל המומחים ומסקנות מילוליות בדו״ח',
        icon: 'Bot',
        healthId: 'ai',
        municipalities: [],
      },
    ],
  },
]

export const sourcesRouter = router({
  // Health snapshot of all platform data sources. Pollable (the page uses
  // refetchInterval). Read-only.
  health: requireAction('admin.sources.view').query(
    async ({ ctx }): Promise<SourcesHealthResponse> => {
      const nowMs = Date.now()
      // Look back 24h for the AI cross-derived signal.
      const windowIso = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()

      const [healthRes, recentJobsRes, lastDoneRes] = await Promise.all([
        ctx.db
          .from('sc_source_health')
          .select('source,status,latency_ms,error_count,last_ok_at,last_error,checked_at'),
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

      // Index persisted health rows by source. Last write per source wins (the
      // pipeline keeps one row per source, but guard against dupes anyway).
      const healthBySource = new Map<string, HealthRow>()
      for (const r of (healthRes.data ?? []) as HealthRow[]) {
        if (r.source) healthBySource.set(r.source, r)
      }

      // Secondary AI signal from analyzer jobs.
      const recentRows = (recentJobsRes.data ?? []) as AiJobRow[]
      const lastDone =
        (lastDoneRes.data?.[0] as { completed_at: string | null } | undefined)?.completed_at ?? null
      const aiSignal = deriveAiSignal(recentRows, lastDone, nowMs)

      // Assemble in catalog order from real rows, with the AI cross-derivation
      // merged in (or used standalone when the AI has no persisted row yet).
      const sources: SourceHealth[] = SOURCE_DEFS.map((def) => {
        const row = healthBySource.get(def.id)
        if (def.id === 'ai') {
          return row
            ? mergeAi(fromHealthRow(def, row, nowMs), aiSignal)
            : aiFromSignalOnly(def, aiSignal)
        }
        return row ? fromHealthRow(def, row, nowMs) : uninstrumentedSource(def)
      })

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

  // Full source catalog — the complete inventory of everything the analyzer
  // connects to, grouped, with type + what it feeds + the municipalities we
  // have municipal-web data for. Static structure, enriched with live status
  // from sc_source_health for entries that map to a canonical healthId.
  catalog: requireAction('admin.sources.view').query(async ({ ctx }) => {
    const nowMs = Date.now()

    const healthRes = await ctx.db
      .from('sc_source_health')
      .select('source,status,latency_ms,last_ok_at,checked_at')

    const live: Partial<Record<SourceId, {
      status: SourceStatus
      instrumented: boolean
      latencyMs: number | null
      lastUpdated: string | null
    }>> = {}
    for (const r of (healthRes.data ?? []) as Array<{
      source: string | null
      status: string | null
      latency_ms: number | null
      last_ok_at: string | null
    }>) {
      if (!r.source) continue
      live[r.source as SourceId] = {
        status: coerceStatus(r.status),
        instrumented: true,
        latencyMs: r.latency_ms ?? null,
        lastUpdated: r.last_ok_at ?? null,
      }
    }

    // Flatten to count types + municipalities.
    const all: CatalogSource[] = CATALOG_GROUPS.flatMap((g) => g.sources)
    const municipalities = new Set<string>()
    for (const s of all) for (const c of s.municipalities) municipalities.add(c)

    const summary = {
      total: all.length,
      api: all.filter((s) => s.type === 'api').length,
      web: all.filter((s) => s.type === 'web').length,
      static: all.filter((s) => s.type === 'static').length,
      municipalities: municipalities.size,
    }

    const groups: CatalogGroup[] = CATALOG_GROUPS

    return { groups, live, summary, now: new Date(nowMs).toISOString() }
  }),
})
