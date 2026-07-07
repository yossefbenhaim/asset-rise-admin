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
    <div className="sc-card p-0 overflow-hidden mb-3 border-r-4 border-r-sc-gold">
      <div className="p-4 flex items-start gap-3.5">
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-sc-navy text-sc-gold flex items-center justify-center">
          <Icon size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[16px] font-black text-sc-text m-0">{name}</h2>
            <span className="text-[11px] text-sc-text-muted">{total} דרישות</span>
            {mustsMissing > 0 && (
              <span className="text-[11px] font-bold text-sc-danger">
                {mustsMissing} חובות בדין טרם טופלו
              </span>
            )}
          </div>
          {info?.summary && (
            <p className="text-[12.5px] text-sc-text-secondary leading-relaxed mt-1 mb-0">
              {info.summary}
            </p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
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
        </div>
        <div className="flex-shrink-0 w-28 text-left">
          <div className="text-[11px] text-sc-text-muted mb-1">
            טופלו <b className="sc-num text-sc-text">{done}</b>/
            <span className="sc-num">{total}</span>
          </div>
          <div className="h-1.5 rounded-full bg-sc-bg overflow-hidden">
            <div
              className={`h-full rounded-full ${pct === 100 ? 'bg-sc-success' : 'bg-sc-gold'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
      {showApplies && info?.applies && (
        <div className="px-4 pb-4">
          <div className="bg-sc-bg rounded-lg p-3 text-[12px] text-sc-text-secondary leading-relaxed whitespace-pre-wrap">
            {info.applies}
          </div>
        </div>
      )}
    </div>
  )
}
