// Full source catalog — "כל המקורות": the complete inventory of everything the
// analyzer connects to, grouped (GIS/GovMap, planning/MAVAT, data.gov.il,
// municipal-web+firecrawl, light-rail, Tel-Aviv ArcGIS, policy, AI). Each entry
// shows a type chip (API/web/static), what it feeds, a live status dot when it
// maps to a health row, and — for municipal-web — the list of cities we have
// scraped data for plus a firecrawl note. Groups are collapsible.
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Map, Building2, FileText, Landmark, Bot, Database, TrainFront, Building,
  SlidersHorizontal, LayoutGrid, MapPinned, Coins, Construction, HardHat,
  Link as LinkIcon, Cloud, Plug, Globe, Package, ChevronDown, MapPin,
  type LucideIcon,
} from 'lucide-react'
import type {
  CatalogGroup, CatalogSource, SourceConnType, SourcesCatalogResponse,
} from '@asset-rise/shared'
import { timeAgo } from '@/lib/format'

const ICONS: Record<string, LucideIcon> = {
  Map, Building2, FileText, Landmark, Bot, Database, TrainFront, Building,
  SlidersHorizontal, LayoutGrid, MapPinned, Coins, Construction, HardHat,
  Link: LinkIcon, MapPin,
}

// Type chip: icon + Hebrew label + tint. api=connection, web=scrape, static=bundled.
const TYPE_META: Record<SourceConnType, { label: string; icon: LucideIcon; cls: string }> = {
  api:    { label: 'API', icon: Plug,   cls: 'bg-sc-light-blue text-sc-primary' },
  web:    { label: 'קציר אתר', icon: Globe, cls: 'bg-sc-warning-bg text-sc-warning' },
  static: { label: 'נתון מובנה', icon: Package, cls: 'bg-sc-success-bg text-sc-success' },
}

// Live status dot color.
const DOT: Record<'active' | 'degraded' | 'down', string> = {
  active: 'bg-sc-success',
  degraded: 'bg-sc-warning',
  down: 'bg-sc-danger',
}

export function SourceCatalog({ data }: { data: SourcesCatalogResponse }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Catalog header strip — what + how-many */}
      <div className="sc-glass p-4 flex flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <span className="grid place-items-center w-10 h-10 rounded-sc-input shrink-0 bg-sc-light-blue text-sc-primary">
            <Cloud size={19} />
          </span>
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-sc-text">כל המקורות שאליהם אנו מתחברים</div>
            <div className="text-[11.5px] text-sc-text-muted">
              הקטלוג המלא של מקורות המידע שמזינים את מנוע הניתוח — לפי קבוצות, סוג חיבור ומה כל אחד מזין
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Stat label="סך מקורות" value={data.summary.total} />
          <Stat label="API" value={data.summary.api} />
          <Stat label="קציר אתר" value={data.summary.web} />
          <Stat label="נתון מובנה" value={data.summary.static} />
          <Stat label="רשויות במאגר" value={data.summary.municipalities} />
        </div>
      </div>

      {/* Groups laid out side by side. A masonry (CSS multi-column) layout packs
          the cards tightly top-to-bottom so short groups (1 source) don't leave
          big vertical gaps under them the way a fixed grid row does. */}
      <div className="columns-1 md:columns-2 xl:columns-3 gap-4">
        {data.groups.map((g) => (
          <div key={g.key} className="mb-4 break-inside-avoid">
            <CatalogGroupBlock group={g} live={data.live} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-sc-input bg-sc-bg-subtle px-2.5 py-1">
      <span className="text-[13px] font-bold text-sc-text sc-num">{value}</span>
      <span className="text-[10.5px] text-sc-text-muted">{label}</span>
    </span>
  )
}

function CatalogGroupBlock({
  group, live,
}: {
  group: CatalogGroup
  live: SourcesCatalogResponse['live']
}) {
  const [open, setOpen] = useState(true)
  const GroupIcon = ICONS[group.icon] ?? Map

  return (
    <div className="sc-glass overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 p-4 text-right hover:bg-sc-bg-subtle/60 transition-colors"
      >
        <span className="grid place-items-center w-9 h-9 rounded-sc-input shrink-0 bg-sc-light-blue text-sc-primary">
          <GroupIcon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold text-sc-text">{group.title}</div>
          <div className="text-[11px] text-sc-text-muted truncate">{group.subtitle}</div>
        </div>
        <span className="text-[11px] font-semibold text-sc-text-muted sc-num">{group.sources.length}</span>
        <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.2 }} className="text-sc-text-muted">
          <ChevronDown size={16} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 grid grid-cols-1 gap-3 items-stretch">
              {group.sources.map((s) => (
                <CatalogSourceCard key={s.key} source={s} live={s.healthId ? live[s.healthId] : undefined} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CatalogSourceCard({
  source, live,
}: {
  source: CatalogSource
  live: SourcesCatalogResponse['live'][keyof SourcesCatalogResponse['live']]
}) {
  const Icon = ICONS[source.icon] ?? Map
  const type = TYPE_META[source.type]
  const TypeIcon = type.icon

  return (
    <div className="h-full rounded-sc-input border border-sc-border/60 bg-sc-bg-subtle/40 p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2.5">
        <span className="grid place-items-center w-8 h-8 rounded-sc-input shrink-0 bg-sc-light-blue/70 text-sc-primary">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12.5px] font-bold text-sc-text">{source.name}</span>
            {/* Live status dot — only for entries that map to a health row */}
            {live?.instrumented && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-sc-text-muted"
                title={live.lastUpdated ? `עודכן ${timeAgo(live.lastUpdated)}` : undefined}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${DOT[live.status]}`} />
                ניטור חי
              </span>
            )}
          </div>
          <div className="text-[10.5px] text-sc-text-muted">{source.provider}</div>
        </div>
        {/* Type chip */}
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${type.cls}`}>
          <TypeIcon size={11} />
          {type.label}
        </span>
      </div>

      {/* What it feeds */}
      <div className="text-[11px] text-sc-text-secondary leading-snug">
        <span className="text-sc-text-muted">מה זה מזין: </span>
        {source.feeds}
      </div>

      {/* Municipal-web: city sub-list + firecrawl note */}
      {source.municipalities.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-sc-input bg-sc-light-blue/50 px-2.5 py-2">
          <div className="text-[10.5px] font-semibold text-sc-primary">רשויות עם נתוני קציר זמינים</div>
          <div className="flex flex-wrap gap-1.5">
            {source.municipalities.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded-full bg-sc-surface px-2 py-0.5 text-[10.5px] font-medium text-sc-text border border-sc-border/60"
              >
                <MapPin size={10} className="text-sc-primary" />
                {c}
              </span>
            ))}
          </div>
          <div className="text-[10px] text-sc-text-muted leading-snug">
            הנתונים נקצרים אוטומטית מעמודי ההתחדשות העירונית באתרי הרשויות באמצעות Firecrawl.
          </div>
        </div>
      )}
    </div>
  )
}
