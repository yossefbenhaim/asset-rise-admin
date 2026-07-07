// "Who closes this" block on a legal requirement card: which agent (or human)
// can resolve the requirement, how the chain works, and a ready-to-paste task
// prompt in the right format for that resolver.
import { useState } from 'react'
import {
  Wrench,
  Scale,
  Banknote,
  ShieldCheck,
  UserCheck,
  ClipboardCopy,
  Check,
  ChevronDown,
} from 'lucide-react'

// lucide's typed component is awkward to constrain — `any` matches Sidebar.tsx.
const META: Record<string, { label: string; icon: any; cls: string }> = {
  dev: {
    label: 'משימת פיתוח · Claude Code',
    icon: Wrench,
    cls: 'bg-sc-light-blue text-sc-primary',
  },
  murdock: { label: 'מאט מרדוק · טיוטה משפטית', icon: Scale, cls: 'bg-sc-cream text-sc-gold' },
  fury: { label: 'פיורי · כספים (CFO)', icon: Banknote, cls: 'bg-sc-navy text-white' },
  shield: { label: 'שילד · אבטחה', icon: ShieldCheck, cls: 'bg-sc-success-bg text-sc-success' },
  yossef: {
    label: 'רק אתה · פעולה אנושית',
    icon: UserCheck,
    cls: 'bg-sc-warning-bg text-sc-warning',
  },
}

export function ResolverBlock({
  resolver,
  how,
  prompt,
}: {
  resolver: string | null
  how: string | null
  prompt: string | null
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!resolver) return null
  const meta = META[resolver] ?? META.yossef
  const Icon = meta.icon

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable — the prompt is still selectable */
    }
  }

  return (
    <div className="border-t border-sc-border/60 pt-2 mt-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10.5px] font-bold text-sc-text-muted">מי סוגר את זה:</span>
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sc-pill text-[10.5px] font-bold ${meta.cls}`}
        >
          <Icon size={11} /> {meta.label}
        </span>
        {prompt && (
          <button
            onClick={() => setOpen(v => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-sc-primary bg-transparent border-0 p-0 cursor-pointer"
          >
            <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            המשימה המוכנה
          </button>
        )}
      </div>
      {how && (
        <p className="text-[11.5px] text-sc-text-secondary mt-1 mb-0 leading-relaxed">{how}</p>
      )}
      {open && prompt && (
        <div className="mt-2 bg-sc-bg rounded-lg p-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10.5px] font-bold text-sc-text-muted">
              מוכן להדבקה אצל {meta.label.split(' ·')[0]}
            </span>
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-sc-gold bg-transparent border-0 p-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check size={12} /> הועתק
                </>
              ) : (
                <>
                  <ClipboardCopy size={12} /> העתק משימה
                </>
              )}
            </button>
          </div>
          <pre
            className="text-[11px] text-sc-text-secondary whitespace-pre-wrap m-0 leading-relaxed"
            style={{ fontFamily: 'inherit' }}
          >
            {prompt}
          </pre>
        </div>
      )}
    </div>
  )
}
