// Rich header card for one legal domain in the "לשכה משפטית" tab: tinted icon,
// what the domain is, WHY it matters to this business (summary), which parts of
// the company it touches (tags), and a fulfilment progress bar. The full legal
// applicability analysis opens on demand.
import { useState } from 'react'
import {
  ShieldCheck,
  ShoppingCart,
  PersonStanding,
  Building2,
  FileSignature,
  Receipt,
  Megaphone,
  Briefcase,
  Copyright,
  BookOpen,
  ChevronDown,
  Globe,
  Users,
  Banknote,
  Package,
  Gavel,
  Landmark,
} from 'lucide-react'

// lucide's typed component is awkward to constrain — `any` matches Sidebar.tsx.
const ICONS: Record<string, any> = {
  ShieldCheck,
  ShoppingCart,
  PersonStanding,
  Building2,
  FileSignature,
  Receipt,
  Megaphone,
  Briefcase,
  Copyright,
}

// Each tag maps a domain to the part of the business it protects.
const TAG_STYLE: Record<string, { icon: any; cls: string }> = {
  אתר: { icon: Globe, cls: 'bg-sc-light-blue text-sc-primary' },
  מוצר: { icon: Package, cls: 'bg-sc-light-blue text-sc-primary' },
  לקוחות: { icon: Users, cls: 'bg-sc-success-bg text-sc-success' },
  עסק: { icon: Briefcase, cls: 'bg-sc-cream text-sc-gold' },
  כסף: { icon: Banknote, cls: 'bg-sc-cream text-sc-gold' },
  'אבטחת מידע': { icon: ShieldCheck, cls: 'bg-sc-navy text-white' },
  שיווק: { icon: Megaphone, cls: 'bg-sc-warning-bg text-sc-warning' },
  'סיכון תביעות': { icon: Gavel, cls: 'bg-sc-danger-bg text-sc-danger' },
}

export interface DomainInfo {
  name: string
  icon: string | null
  summary: string | null
  applies: string | null
  tags: string[]
  sort_order: number
}

export function DomainHeader({
  name,
  info,
  total,
  done,
  mustsMissing,
}: {
  name: string
  info: DomainInfo | null
  total: number
  done: number
  mustsMissing: number
}) {
  const [showApplies, setShowApplies] = useState(false)
  const Icon = ICONS[info?.icon ?? ''] ?? BookOpen
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="sc-card p-4 overflow-hidden mb-3 border-r-4 border-r-sc-gold">
      {/* icon + name + counters — one compact row that survives narrow screens */}
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-sc-navy text-sc-gold flex items-center justify-center">
          <Icon size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] sm:text-[16px] font-black text-sc-text m-0 leading-tight">
            {name}
          </h2>
          <div className="flex items-center gap-2 flex-wrap text-[11px] mt-0.5">
            <span className="text-sc-text-muted">{total} דרישות</span>
            {mustsMissing > 0 && (
              <span className="font-bold text-sc-danger">{mustsMissing} חובות בדין טרם טופלו</span>
            )}
          </div>
        </div>
      </div>

      {/* full-width text — never squeezed by side columns */}
      {info?.summary && (
        <p className="text-[12.5px] text-sc-text-secondary leading-relaxed mt-2.5 mb-0">
          {info.summary}
        </p>
      )}

      <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
        {(info?.tags ?? []).map(t => {
          const s = TAG_STYLE[t] ?? { icon: Landmark, cls: 'bg-sc-bg text-sc-text-secondary' }
          const TIcon = s.icon
          return (
            <span
              key={t}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sc-pill text-[10.5px] font-bold ${s.cls}`}
            >
              <TIcon size={11} /> {t}
            </span>
          )
        })}
        {info?.applies && (
          <button
            onClick={() => setShowApplies(v => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-sc-primary bg-transparent border-0 p-0 cursor-pointer mr-1"
          >
            <ChevronDown
              size={12}
              className={`transition-transform ${showApplies ? 'rotate-180' : ''}`}
            />
            הניתוח המשפטי המלא
          </button>
        )}
      </div>

      {/* progress strip across the card bottom */}
      <div className="flex items-center gap-2.5 mt-3">
        <div className="flex-1 h-1.5 rounded-full bg-sc-bg overflow-hidden">
          <div
            className={`h-full rounded-full ${pct === 100 ? 'bg-sc-success' : 'bg-sc-gold'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="flex-shrink-0 text-[11px] text-sc-text-muted">
          טופלו <b className="sc-num text-sc-text">{done}</b>/
          <span className="sc-num">{total}</span>
        </span>
      </div>

      {showApplies && info?.applies && (
        <div className="mt-3 bg-sc-bg rounded-lg p-3 text-[12px] text-sc-text-secondary leading-relaxed whitespace-pre-wrap">
          {info.applies}
        </div>
      )}
    </div>
  )
}
