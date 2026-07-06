// AI summary detail panel. Fetches full detail (flattened fields + raw blobs),
// renders the headline / opinion / 3-hat panel / recommendations / sources, and
// exposes a Regenerate action (gated to admin.ai.regenerate). The raw request +
// result jsonb are shown collapsed for debugging.
import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  RefreshCw,
  AlertTriangle,
  Users,
  Lightbulb,
  Link2,
  ChevronDown,
  Sparkles,
  Hash,
  Cpu,
} from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Drawer } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useRoleKeys } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { dateTime } from '@/lib/format'

const ROLE_LABEL: Record<string, string> = {
  appraiser: 'שמאי',
  architect: 'אדריכל',
  developer: 'יזם',
}
const STANCE: Record<string, { label: string; kind: 'success' | 'info' | 'warning' }> = {
  positive: { label: 'חיובי', kind: 'success' },
  neutral: { label: 'ניטרלי', kind: 'info' },
  cautious: { label: 'זהיר', kind: 'warning' },
}

export function SummaryDrawer({
  researchKey,
  onClose,
}: {
  researchKey: string
  onClose: () => void
}) {
  const toast = useToast()
  const roleKeys = useRoleKeys()
  const canRegen = can(roleKeys, 'admin.ai.regenerate')
  const utils = trpc.useContext()
  const detail = trpc.ai.get.useQuery(
    { research_key: researchKey },
    { refetchOnWindowFocus: false },
  )
  const d = detail.data

  const regenerate = trpc.ai.regenerate.useMutation({
    onSuccess: () => {
      toast.show('הניתוח נשלח להרצה מחדש')
      void utils.ai.get.invalidate({ research_key: researchKey })
      void utils.ai.list.invalidate()
    },
    onError: e => toast.show(e.message),
  })

  return (
    <Drawer open onClose={onClose} width={560} title="פרטי ניתוח AI">
      {detail.isLoading || !d ? (
        <div className="space-y-3">
          <Skeleton h={28} w="70%" />
          <Skeleton h={90} w="100%" />
          <Skeleton h={130} w="100%" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[16px] font-extrabold text-sc-text m-0 leading-tight inline-flex items-center gap-1.5">
                <Sparkles size={16} className="text-sc-primary shrink-0" />
                {d.heading ?? 'ניתוח ללא כותרת'}
              </h3>
              <StatusBadge status={d.status} />
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-[12px] text-sc-text-secondary">
              {d.version && <Pill kind="navy">{d.version}</Pill>}
              {d.model && (
                <span className="inline-flex items-center gap-1">
                  <Cpu size={12} /> <code className="text-[11px]">{d.model}</code>
                </span>
              )}
              {d.confidence && <Pill kind="info">ביטחון: {confidenceLabel(d.confidence)}</Pill>}
              <span className="inline-flex items-center gap-1 sc-num break-all">
                <Hash size={12} /> {d.research_key}
              </span>
            </div>
          </div>

          {/* Action */}
          {canRegen && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw size={14} />}
                loading={regenerate.isLoading}
                onClick={() => regenerate.mutate({ research_key: d.research_key })}
              >
                הרץ ניתוח מחדש
              </Button>
            </div>
          )}

          {/* Error */}
          {d.error && (
            <div className="flex gap-2 items-start text-[12px] text-sc-danger bg-sc-danger-bg rounded-sc-input p-2.5">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="break-words whitespace-pre-wrap">{d.error}</span>
            </div>
          )}

          {/* Opinion / summary text */}
          <Section title="חוות דעת">
            {d.summary ? (
              <p className="text-[13px] text-sc-text m-0 leading-relaxed whitespace-pre-wrap">
                {d.summary}
              </p>
            ) : (
              <p className="text-[12px] text-sc-text-muted m-0">אין טקסט חוות דעת.</p>
            )}
          </Section>

          {/* 3-hat panel */}
          {d.perspectives.length > 0 && (
            <Section title="פאנל 3 הכובעים">
              <div className="space-y-2.5">
                {d.perspectives.map((p, i) => {
                  const st = p.stance ? STANCE[p.stance] : null
                  return (
                    <div key={i} className="rounded-sc-input bg-sc-bg p-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-sc-text">
                          <Users size={13} className="text-sc-gold" />
                          {ROLE_LABEL[p.role] ?? p.role}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          {st && <Pill kind={st.kind}>{st.label}</Pill>}
                          {p.rating != null && (
                            <span className="sc-num text-[12px] font-extrabold text-sc-primary">
                              {p.rating}
                            </span>
                          )}
                        </span>
                      </div>
                      {p.opinion_he && (
                        <p className="text-[12px] text-sc-text-secondary m-0 leading-snug whitespace-pre-wrap">
                          {p.opinion_he}
                        </p>
                      )}
                      {p.key_point_he && (
                        <p className="text-[11px] text-sc-text-muted m-0 mt-1">
                          • {p.key_point_he}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Recommendations */}
          {d.recommendations.length > 0 && (
            <Section title="המלצות">
              <ul className="m-0 pr-4 space-y-1">
                {d.recommendations.slice(0, 8).map((rec, i) => (
                  <li
                    key={i}
                    className="text-[12px] text-sc-text-secondary leading-snug inline-flex gap-1.5"
                  >
                    <Lightbulb size={12} className="text-sc-gold shrink-0 mt-0.5" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Sources */}
          {d.sources.length > 0 && (
            <Section title="מקורות">
              <ul className="m-0 space-y-1">
                {d.sources.slice(0, 12).map((s, i) => {
                  const isUrl = /^https?:\/\//i.test(s)
                  return (
                    <li key={i} className="text-[11.5px] inline-flex gap-1.5 w-full">
                      <Link2 size={12} className="text-sc-primary shrink-0 mt-0.5" />
                      {isUrl ? (
                        <a
                          href={s}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sc-primary break-all hover:underline"
                        >
                          {s}
                        </a>
                      ) : (
                        <span className="text-sc-text-secondary break-words">{s}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Section>
          )}

          {/* Meta */}
          <Section title="פרטי עבודה">
            {d.attempts != null && (
              <Row label="ניסיונות" value={<span className="sc-num">{d.attempts}</span>} />
            )}
            <Row label="נוצר" value={dateTime(d.created_at)} />
            {d.updated_at && <Row label="עודכן" value={dateTime(d.updated_at)} />}
            {d.completed_at && <Row label="הושלם" value={dateTime(d.completed_at)} />}
          </Section>

          {/* Raw blobs (collapsed) */}
          <RawBlock title="קלט גולמי (request)" value={d.request} />
          <RawBlock title="פלט גולמי (result)" value={d.result} />
        </div>
      )}
    </Drawer>
  )
}

function confidenceLabel(c: string): string {
  return c === 'high' ? 'גבוה' : c === 'low' ? 'נמוך' : c === 'medium' ? 'בינוני' : c
}

function RawBlock({ title, value }: { title: string; value: unknown }) {
  const [open, setOpen] = useState(false)
  if (value == null) return null
  return (
    <div className="border border-sc-border rounded-sc-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-[12px] font-bold text-sc-text hover:bg-sc-bg transition-colors"
      >
        <span>{title}</span>
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <pre
          dir="ltr"
          className="m-0 p-3 bg-sc-bg text-[11px] text-sc-text-secondary overflow-x-auto max-h-80 leading-relaxed"
        >
          {safeJson(value)}
        </pre>
      )}
    </div>
  )
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="border border-sc-border rounded-sc-card p-3.5"
    >
      <div className="text-[12px] font-bold text-sc-text mb-2">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </motion.div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2 text-[13px]">
      <div className="text-sc-text-secondary w-24 shrink-0">{label}</div>
      <div className="flex-1 break-words text-sc-text">{value}</div>
    </div>
  )
}
