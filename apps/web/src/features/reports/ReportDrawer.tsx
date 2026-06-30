// Flagship report detail panel. Fetches full detail (report jsonb + job + flag),
// renders a human summary, exposes operational actions: open the customer-facing
// report, full re-run, AI refresh, inline edit (score / address), pin + note.
import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  ExternalLink, RefreshCw, Sparkles, Pin, PinOff, Save, AlertTriangle, MapPin, Hash,
} from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Drawer } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { dateTime } from '@/lib/format'
import { scoreTone } from './scoreColor'

// Customer-facing report lives on the Asset Rise app domain.
const CUSTOMER_REPORT_BASE = 'https://asset-rise.byclick.co.il'

export function ReportDrawer({ token, onClose }: { token: string; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useContext()
  const detail = trpc.reports.get.useQuery({ token }, { refetchOnWindowFocus: false })
  const d = detail.data

  const refresh = () => {
    void utils.reports.get.invalidate({ token })
    void utils.reports.list.invalidate()
  }

  const rerun = trpc.reports.rerun.useMutation({
    onSuccess: () => { toast.show('הדוח נשלח להרצה מחדש'); refresh() },
    onError: e => toast.show(e.message),
  })
  const regenAi = trpc.reports.regenerateAi.useMutation({
    onSuccess: () => { toast.show('רענון AI נשלח לתור'); refresh() },
    onError: e => toast.show(e.message),
  })

  return (
    <Drawer open onClose={onClose} width={520} title="פרטי דוח">
      {detail.isLoading || !d ? (
        <div className="space-y-3">
          <Skeleton h={28} w="66%" />
          <Skeleton h={80} w="100%" />
          <Skeleton h={130} w="100%" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Header: address + score + status */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[17px] font-extrabold text-sc-text m-0 leading-tight">
                {d.address_display ?? 'ללא כתובת'}
              </h3>
              <ScoreBadge score={d.score} />
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-[12px] text-sc-text-secondary">
              <StatusBadge status={d.status} />
              {d.city && (
                <span className="inline-flex items-center gap-1"><MapPin size={12} /> {d.city}</span>
              )}
              {(d.gush != null || d.helka != null) && (
                <span className="inline-flex items-center gap-1 sc-num">
                  <Hash size={12} /> {d.gush ?? '—'}/{d.helka ?? '—'}
                </span>
              )}
              {d.paid ? <Pill kind="success">שולם</Pill> : <Pill kind="neutral">לא שולם</Pill>}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            <a
              href={`${CUSTOMER_REPORT_BASE}/report/${d.token}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="secondary" size="sm" icon={<ExternalLink size={14} />}>
                פתח דוח לקוח
              </Button>
            </a>
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={14} />}
              loading={rerun.isLoading}
              onClick={() => rerun.mutate({ token: d.token })}
            >
              הרץ מחדש
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Sparkles size={14} />}
              loading={regenAi.isLoading}
              onClick={() => regenAi.mutate({ token: d.token })}
            >
              רענן AI
            </Button>
          </div>

          {/* Job status / error */}
          {d.job && (
            <Section title="מצב מחקר (Job)">
              <Row label="סטטוס" value={<StatusBadge status={d.job.status} />} />
              {d.research_key && (
                <Row label="מפתח" value={<code className="text-[11px] break-all">{d.research_key}</code>} />
              )}
              {d.job.attempts != null && <Row label="ניסיונות" value={<span className="sc-num">{d.job.attempts}</span>} />}
              {d.job.updated_at && <Row label="עודכן" value={dateTime(d.job.updated_at)} />}
              {d.job.error && (
                <div className="mt-1 flex gap-2 items-start text-[12px] text-sc-danger bg-sc-danger-bg rounded-sc-input p-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span className="break-words whitespace-pre-wrap">{d.job.error}</span>
                </div>
              )}
            </Section>
          )}

          {/* Lead + meta */}
          <Section title="ליד ופרטים">
            {d.lead_name && <Row label="שם" value={d.lead_name} />}
            {d.lead_phone && <Row label="טלפון" value={<a href={`tel:${d.lead_phone}`}>{d.lead_phone}</a>} />}
            {d.lead_email && <Row label="אימייל" value={<a href={`mailto:${d.lead_email}`}>{d.lead_email}</a>} />}
            <Row label="נוצר" value={dateTime(d.created_at)} />
            {d.accessed_at && <Row label="נצפה לאחרונה" value={dateTime(d.accessed_at)} />}
          </Section>

          {/* Report summary (from EvaluateResponse jsonb) */}
          <ReportSummary report={d.report} />

          {/* Inline edit */}
          <EditFields
            token={d.token}
            initialScore={d.score}
            initialAddress={d.address_display}
            onSaved={refresh}
          />

          {/* Pin + internal note */}
          <FlagEditor
            token={d.token}
            pinned={d.flag?.pinned ?? false}
            note={d.flag?.note ?? ''}
            onSaved={refresh}
          />
        </div>
      )}
    </Drawer>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  const t = scoreTone(score)
  return (
    <span
      className={`inline-grid place-items-center min-w-[44px] h-11 px-2 rounded-sc-input text-[20px] font-extrabold sc-num ${t.bg} ${t.text}`}
    >
      {t.label}
    </span>
  )
}

// Pulls a readable summary out of the EvaluateResponse jsonb without depending
// on the full type — every field is read defensively.
function ReportSummary({ report }: { report: unknown }) {
  const r = report && typeof report === 'object' ? (report as Record<string, any>) : null
  if (!r) {
    return (
      <Section title="תקציר דוח">
        <p className="text-[12px] text-sc-text-muted m-0">אין דוח שמור עדיין.</p>
      </Section>
    )
  }
  const summary = typeof r.summary_he === 'string' ? r.summary_he : null
  const recommendations: string[] = Array.isArray(r.recommendations) ? r.recommendations : []
  const categories: any[] = Array.isArray(r.categories) ? r.categories : []
  const time = r.expected_time_years
  const track = typeof r.recommended_track === 'string' ? r.recommended_track : null
  const potential = r.building_potential

  return (
    <Section title="תקציר דוח">
      {summary && <p className="text-[13px] text-sc-text m-0 mb-3 leading-relaxed">{summary}</p>}
      <div className="flex flex-wrap gap-2 mb-3">
        {track && <Pill kind="navy">{trackLabel(track)}</Pill>}
        {time && typeof time === 'object' && (
          <Pill kind="info">⏱ {time.min}–{time.max} שנים</Pill>
        )}
        {potential && typeof potential === 'object' && potential.target_units != null && (
          <Pill kind="gold">
            {potential.current_units ?? '?'} → ~{potential.target_units} דירות
          </Pill>
        )}
      </div>
      {categories.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {categories.slice(0, 7).map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="w-5 text-center">{c.emoji ?? '·'}</span>
              <span className="flex-1 text-sc-text-secondary truncate">{c.title ?? c.key}</span>
              {typeof c.subscore === 'number' && (
                <span className="sc-num text-sc-text-muted">{c.subscore}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {recommendations.length > 0 && (
        <div>
          <div className="text-[11px] font-bold text-sc-text-secondary mb-1">המלצות</div>
          <ul className="m-0 pr-4 space-y-1">
            {recommendations.slice(0, 5).map((rec, i) => (
              <li key={i} className="text-[12px] text-sc-text-secondary leading-snug">{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

function trackLabel(track: string): string {
  const map: Record<string, string> = {
    tama38: 'תמ"א 38',
    pinui_binui: 'פינוי בינוי',
    demolition_rebuild: 'הריסה ובנייה',
    none: 'לא רלוונטי',
  }
  return map[track] ?? track
}

function EditFields({
  token, initialScore, initialAddress, onSaved,
}: {
  token: string
  initialScore: number | null
  initialAddress: string | null
  onSaved: () => void
}) {
  const toast = useToast()
  const [score, setScore] = useState(initialScore != null ? String(initialScore) : '')
  const [address, setAddress] = useState(initialAddress ?? '')

  useEffect(() => { setScore(initialScore != null ? String(initialScore) : '') }, [initialScore])
  useEffect(() => { setAddress(initialAddress ?? '') }, [initialAddress])

  const update = trpc.reports.updateFields.useMutation({
    onSuccess: () => { toast.show('הדוח עודכן'); onSaved() },
    onError: e => toast.show(e.message),
  })

  const scoreNum = score === '' ? null : Number(score)
  const scoreInvalid = score !== '' && (!Number.isInteger(scoreNum) || scoreNum! < 0 || scoreNum! > 100)
  const dirty =
    (scoreNum !== initialScore && !scoreInvalid) ||
    (address.trim() !== (initialAddress ?? '').trim() && address.trim().length > 0)

  const save = () => {
    if (scoreInvalid) { toast.show('ציון חייב להיות 0–100'); return }
    const payload: { token: string; score?: number; address_display?: string } = { token }
    if (scoreNum != null && scoreNum !== initialScore) payload.score = scoreNum
    if (address.trim() && address.trim() !== (initialAddress ?? '').trim()) payload.address_display = address.trim()
    update.mutate(payload)
  }

  return (
    <Section title="עריכה ידנית">
      <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
        <label className="text-[12px] text-sc-text-secondary">ציון</label>
        <input
          value={score}
          onChange={e => setScore(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          placeholder="0–100"
          className={`w-24 bg-sc-bg border rounded-sc-input py-1.5 px-2 text-[13px] sc-num outline-none focus:border-sc-primary ${scoreInvalid ? 'border-sc-danger' : 'border-sc-border'}`}
        />
        <label className="text-[12px] text-sc-text-secondary">כתובת</label>
        <input
          value={address}
          onChange={e => setAddress(e.target.value)}
          className="w-full bg-sc-bg border border-sc-border rounded-sc-input py-1.5 px-2 text-[13px] outline-none focus:border-sc-primary"
        />
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          icon={<Save size={14} />}
          disabled={!dirty}
          loading={update.isLoading}
          onClick={save}
        >
          שמור שינויים
        </Button>
      </div>
    </Section>
  )
}

function FlagEditor({
  token, pinned, note, onSaved,
}: {
  token: string
  pinned: boolean
  note: string
  onSaved: () => void
}) {
  const toast = useToast()
  const [noteVal, setNoteVal] = useState(note)
  useEffect(() => { setNoteVal(note) }, [note])

  const setFlag = trpc.reports.setFlag.useMutation({
    onSuccess: () => { toast.show('עודכן'); onSaved() },
    onError: e => toast.show(e.message),
  })

  const noteDirty = noteVal.trim() !== (note ?? '').trim()

  return (
    <Section title="סימון פנימי">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] text-sc-text-secondary">
          {pinned ? 'דוח מוצמד לראש הרשימה' : 'דוח לא מוצמד'}
        </span>
        <Button
          variant={pinned ? 'gold' : 'ghost'}
          size="sm"
          icon={pinned ? <PinOff size={14} /> : <Pin size={14} />}
          loading={setFlag.isLoading}
          onClick={() => setFlag.mutate({ token, pinned: !pinned })}
        >
          {pinned ? 'בטל הצמדה' : 'הצמד'}
        </Button>
      </div>
      <textarea
        value={noteVal}
        onChange={e => setNoteVal(e.target.value)}
        rows={3}
        placeholder="הערה פנימית (גלויה לצוות בלבד)…"
        className="w-full bg-sc-bg border border-sc-border rounded-sc-input p-2 text-[13px] outline-none focus:border-sc-primary"
      />
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          variant="secondary"
          icon={<Save size={14} />}
          disabled={!noteDirty}
          loading={setFlag.isLoading}
          onClick={() => setFlag.mutate({ token, note: noteVal.trim() || null })}
        >
          שמור הערה
        </Button>
      </div>
    </Section>
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
