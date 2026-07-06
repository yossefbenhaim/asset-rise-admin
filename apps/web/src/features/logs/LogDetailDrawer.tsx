// Log detail panel — full (untruncated) message + the raw meta jsonb,
// pretty-printed. Read-only; the merged feed has no mutations.
import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Hash, User, Server, Clock, Mail, Phone, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import type { LogEntry } from '@asset-rise/shared'
import { Drawer } from '@/components/ui/Drawer'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Pill } from '@/components/ui/Pill'
import { dateTime, timeAgo } from '@/lib/format'

const SERVICE_LABEL: Record<string, string> = {
  audit: 'ביקורת',
  analyzer: 'אנלייזר',
}

function prettyJson(value: unknown): string {
  if (value == null) return '—'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

export function LogDetailDrawer({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const hasMeta = !isEmpty(entry.meta)
  const hasRequest = !isEmpty(entry.request)
  const hasResponse = !isEmpty(entry.response)
  const hasActor = !!(entry.actorName || entry.actorEmail || entry.actorPhone || entry.userId)

  return (
    <Drawer open onClose={onClose} width={520} title="פרטי רשומה">
      <div className="space-y-5">
        {/* Header: severity + service + when */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={entry.severity} />
            <Pill kind="navy">{SERVICE_LABEL[entry.service] ?? entry.service}</Pill>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[12px] text-sc-text-secondary">
            <span className="inline-flex items-center gap-1">
              <Clock size={12} /> {dateTime(entry.timestamp)}
            </span>
            <span className="text-sc-text-muted">·</span>
            <span className="sc-num">{timeAgo(entry.timestamp)}</span>
          </div>
        </div>

        {/* Full message */}
        <Section title="הודעה">
          <pre className="m-0 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-sc-text font-sans">
            {entry.message}
          </pre>
        </Section>

        {/* Who acted — resolved identity + contact */}
        {hasActor && (
          <Section title="מי ביצע">
            <Row
              label="שם"
              value={
                entry.actorName ? (
                  <span className="inline-flex items-center gap-1">
                    <User size={12} className="shrink-0" />
                    {entry.actorName}
                  </span>
                ) : (
                  <span className="text-sc-text-muted">לא ידוע</span>
                )
              }
            />
            {entry.actorEmail && (
              <Row
                label="אימייל"
                value={
                  <a
                    href={`mailto:${entry.actorEmail}`}
                    className="inline-flex items-center gap-1 break-all text-sc-primary sc-num"
                  >
                    <Mail size={12} className="shrink-0" /> {entry.actorEmail}
                  </a>
                }
              />
            )}
            {entry.actorPhone && (
              <Row
                label="טלפון"
                value={
                  <a
                    href={`tel:${entry.actorPhone}`}
                    className="inline-flex items-center gap-1 break-all text-sc-primary sc-num"
                  >
                    <Phone size={12} className="shrink-0" /> {entry.actorPhone}
                  </a>
                }
              />
            )}
            {entry.userId && (
              <Row
                label="מזהה"
                value={
                  <code className="text-[11px] break-all text-sc-text-muted">{entry.userId}</code>
                }
              />
            )}
            {!entry.actorName && !entry.actorEmail && !entry.actorPhone && entry.userId && (
              <p className="text-[11.5px] text-sc-text-muted m-0">הפרופיל לא נמצא (ייתכן שנמחק).</p>
            )}
          </Section>
        )}

        {/* References */}
        <Section title="הפניות">
          <Row
            label="מקור"
            value={
              <span className="inline-flex items-center gap-1">
                <Server size={12} /> {SERVICE_LABEL[entry.service] ?? entry.service}
              </span>
            }
          />
          {entry.reportId && (
            <Row
              label="מזהה דוח"
              value={
                <span className="inline-flex items-center gap-1 break-all">
                  <Hash size={12} className="shrink-0" />
                  <code className="text-[11px] break-all">{entry.reportId}</code>
                </span>
              }
            />
          )}
          {!entry.reportId && !hasActor && (
            <Row label="ישות" value={<span className="text-sc-text-muted">ללא הפניה</span>} />
          )}
        </Section>

        {/* What was sent */}
        {hasRequest && (
          <Section
            title={
              <span className="inline-flex items-center gap-1.5">
                <ArrowUpRight size={13} className="text-sc-primary" /> מה נשלח
              </span>
            }
          >
            <pre
              dir="ltr"
              className="m-0 overflow-x-auto rounded-sc-input bg-sc-bg border border-sc-border p-3 text-[11.5px] leading-relaxed text-sc-text-secondary sc-num"
            >
              {prettyJson(entry.request)}
            </pre>
          </Section>
        )}

        {/* What came back */}
        {hasResponse && (
          <Section
            title={
              <span className="inline-flex items-center gap-1.5">
                <ArrowDownLeft
                  size={13}
                  className={entry.severity === 'error' ? 'text-sc-danger' : 'text-sc-success'}
                />{' '}
                מה חזר
              </span>
            }
          >
            <pre
              dir="ltr"
              className="m-0 overflow-x-auto rounded-sc-input bg-sc-bg border border-sc-border p-3 text-[11.5px] leading-relaxed text-sc-text-secondary sc-num"
            >
              {prettyJson(entry.response)}
            </pre>
          </Section>
        )}

        {/* Raw meta jsonb */}
        <Section title="נתונים גולמיים (meta)">
          {hasMeta ? (
            <pre
              dir="ltr"
              className="m-0 overflow-x-auto rounded-sc-input bg-sc-bg border border-sc-border p-3 text-[11.5px] leading-relaxed text-sc-text-secondary sc-num"
            >
              {prettyJson(entry.meta)}
            </pre>
          ) : (
            <p className="text-[12px] text-sc-text-muted m-0">אין נתונים נוספים.</p>
          )}
        </Section>
      </div>
    </Drawer>
  )
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
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
