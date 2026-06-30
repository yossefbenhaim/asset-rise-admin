// Wong verification detail — the full agent verdict + reason, the document it
// concerns, the gated task, and the tenant. Read-only; Wong owns the verdict.
import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  FileText,
  User,
  ListChecks,
  Clock,
  Gauge,
  AlertTriangle,
  RotateCw,
} from 'lucide-react'
import type { WongVerification, WongConfidence } from '@asset-rise/shared'
import { Drawer } from '@/components/ui/Drawer'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Pill } from '@/components/ui/Pill'
import { dateTime, timeAgo } from '@/lib/format'
import { AiVerdict } from './columns'

const CATEGORY_LABEL: Record<string, string> = {
  tabu: 'נסח טאבו',
  ownership_certificate: 'תעודת בעלות',
  purchase_contract: 'חוזה רכישה',
  inheritance: 'צו ירושה',
  power_of_attorney: 'ייפוי כוח',
  other: 'אחר',
}

const CONFIDENCE: Record<WongConfidence, { label: string; kind: 'success' | 'warning' | 'danger' }> = {
  high: { label: 'ביטחון גבוה', kind: 'success' },
  medium: { label: 'ביטחון בינוני', kind: 'warning' },
  low: { label: 'ביטחון נמוך', kind: 'danger' },
}

export function VerificationDrawer({
  row,
  onClose,
}: {
  row: WongVerification
  onClose: () => void
}) {
  const conf = row.confidence ? CONFIDENCE[row.confidence] : null

  return (
    <Drawer open onClose={onClose} width={540} title="פרטי אימות מסמך">
      <div className="space-y-5">
        {/* Header: status + verdict + when */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={row.status} />
            <AiVerdict approved={row.aiApproved} />
            {conf && <Pill kind={conf.kind}>{conf.label}</Pill>}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[12px] text-sc-text-secondary">
            <span className="inline-flex items-center gap-1">
              <Clock size={12} /> {dateTime(row.createdAt)}
            </span>
            <span className="text-sc-text-muted">·</span>
            <span className="sc-num">{timeAgo(row.createdAt)}</span>
          </div>
        </div>

        {/* The agent's verdict reasoning */}
        <Section title="הכרעת הסוכן">
          {row.reason ? (
            <pre className="m-0 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-sc-text font-sans">
              {row.reason}
            </pre>
          ) : (
            <p className="text-[12px] text-sc-text-muted m-0">
              {row.status === 'failed'
                ? 'האימות נכשל — ראה שגיאה למטה.'
                : 'הסוכן עדיין לא הכריע במסמך זה.'}
            </p>
          )}
        </Section>

        {/* What it was checking */}
        <Section title="המסמך והמשימה">
          <Row
            label="מסמך נדרש"
            value={
              <span className="inline-flex items-center gap-1.5">
                <FileText size={13} className="shrink-0 text-sc-text-muted" />
                {row.docLabel}
              </span>
            }
          />
          {row.docName && <Row label="קובץ שהועלה" value={row.docName} />}
          {row.docCategory && (
            <Row
              label="סיווג"
              value={<Pill kind="navy">{CATEGORY_LABEL[row.docCategory] ?? row.docCategory}</Pill>}
            />
          )}
          {row.mimeType && (
            <Row label="סוג קובץ" value={<code className="text-[11px]">{row.mimeType}</code>} />
          )}
          <Row
            label="משימה"
            value={
              <span className="inline-flex items-center gap-1.5">
                <ListChecks size={13} className="shrink-0 text-sc-text-muted" />
                {row.taskTitle}
              </span>
            }
          />
          <Row
            label="דייר"
            value={
              row.tenant ? (
                <span className="inline-flex items-center gap-1.5">
                  <User size={13} className="shrink-0 text-sc-text-muted" />
                  {row.tenant}
                </span>
              ) : (
                <span className="text-sc-text-muted">לא ידוע</span>
              )
            }
          />
        </Section>

        {/* Run metadata */}
        <Section title="פרטי הרצה">
          <Row
            label="ניסיונות"
            value={
              <span className="inline-flex items-center gap-1.5 sc-num">
                <RotateCw size={12} className="text-sc-text-muted" />
                {row.attempts}
              </span>
            }
          />
          {row.confidence && (
            <Row
              label="רמת ביטחון"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <Gauge size={12} className="text-sc-text-muted" />
                  {conf?.label}
                </span>
              }
            />
          )}
          {row.completedAt && (
            <Row label="הושלם" value={<span className="sc-num">{dateTime(row.completedAt)}</span>} />
          )}
          {row.error && (
            <Row
              label="שגיאה"
              value={
                <span className="inline-flex items-start gap-1.5 text-sc-danger break-words">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>{row.error}</span>
                </span>
              }
            />
          )}
        </Section>
      </div>
    </Drawer>
  )
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
