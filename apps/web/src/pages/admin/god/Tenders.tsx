import { useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { DangerConfirm } from '@/components/ui/DangerConfirm'
import { useToast } from '@/components/ui/Toast'
import { Gavel, Award, Ban, Trophy } from 'lucide-react'
import {
  TENDER_STATUSES,
  TENDER_STATUS_LABEL,
  TENDER_BID_STATUS_LABEL,
  type TenderStatus,
  type TenderBidStatus,
  type GodTenderListItem,
  type GodTenderDetail,
  type GodTenderBid,
} from '@asset-rise/shared'

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[14px]'

function statusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return TENDER_STATUS_LABEL[s as TenderStatus] ?? s
}

function statusPillKind(s: string | null | undefined): React.ComponentProps<typeof Pill>['kind'] {
  switch (s) {
    case 'open': return 'success'
    case 'awarded': return 'gold'
    case 'closed': return 'warning'
    case 'cancelled': return 'danger'
    case 'draft':
    default: return 'neutral'
  }
}

function bidStatusKind(s: string | null | undefined): React.ComponentProps<typeof Pill>['kind'] {
  switch (s) {
    case 'accepted': return 'success'
    case 'rejected': return 'danger'
    case 'withdrawn': return 'neutral'
    case 'submitted':
    default: return 'info'
  }
}

function money(v: number | null): string {
  if (v == null) return '—'
  return '₪' + v.toLocaleString('he-IL')
}

// God-mode Tenders + Bids. List/search tenders (+ bid counts), drill into one
// (+ all its bids sorted by amount), and run the audited god writes:
// setTenderStatus (lifecycle move / reopen), forceAward (DangerConfirm — sets
// the award + bid statuses + links the provider to the project, BYPASSING the
// normal bid flow), and cancelTender (DangerConfirm). Every action is recorded
// in the audit log.
export default function GodTenders() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const list = trpc.god.tenders.list.useQuery(
    {
      q: q.trim() || undefined,
      status: (status || undefined) as TenderStatus | undefined,
      limit: 200,
    },
    { keepPreviousData: true },
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>מכרזים</h1>
      </div>

      <ControlPanel
        title="ניהול מכרזים והצעות — מנהל-על"
        description="שינוי סטטוס מכרז (פתיחה מחדש / סגירה / ביטול), הכרזת זוכה כפויה (קובעת את ההצעה הזוכה, דוחה את היתר ומקשרת את הספק לפרויקט — עוקף את תהליך ההצבעה הרגיל). כל פעולה נרשמת ביומן הביקורת."
        tone="danger"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className={inputCls}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="חיפוש לפי כותרת מכרז…"
          />
          <select
            className={`${inputCls} sm:w-48`}
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="">כל הסטטוסים</option>
            {TENDER_STATUSES.map(s => (
              <option key={s} value={s}>{TENDER_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </ControlPanel>

      <Card className="mt-4">
        <CardHeader
          title="מכרזים"
          meta={<Pill kind="info">{list.data?.length ?? 0}</Pill>}
        />
        <CardBody>
          {list.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : list.isError ? (
            <div className="text-center py-6 text-sc-danger text-[13px]">{list.error.message}</div>
          ) : !list.data?.length ? (
            <EmptyState icon={<Gavel size={28} />} title="אין מכרזים" body="לא נמצאו מכרזים התואמים את הסינון." />
          ) : (
            <div className="space-y-2">
              {list.data.map(t => (
                <TenderRow key={t.id} t={t} onOpen={() => setActiveId(t.id)} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {activeId && (
        <TenderDetail id={activeId} onClose={() => setActiveId(null)} />
      )}
    </div>
  )
}

function TenderRow({ t, onOpen }: { t: GodTenderListItem; onOpen: () => void }) {
  const budget =
    t.budget_min != null || t.budget_max != null
      ? `${money(t.budget_min)} – ${money(t.budget_max)}`
      : null
  return (
    <button
      onClick={onOpen}
      className="w-full text-right p-3 rounded-sc-input border border-sc-border bg-white hover:bg-sc-bg/60 transition-colors"
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="font-semibold text-[14px]">{t.title || '(ללא כותרת)'}</div>
        <Pill kind={statusPillKind(t.status)}>{statusLabel(t.status)}</Pill>
        {t.awarded_provider_id && <Pill kind="gold"><Trophy size={11} /> זוכה נבחר</Pill>}
        <div className="flex-1" />
        <Pill kind="navy">{t.bid_count} הצעות</Pill>
      </div>
      <div className="text-[11px] text-sc-text-muted mt-1 flex flex-wrap gap-2">
        {t.building_address && <span>{t.building_address}</span>}
        {budget && <span>· {budget}</span>}
      </div>
    </button>
  )
}

function TenderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useContext()
  const detail = trpc.god.tenders.get.useQuery({ id })

  const invalidate = () => {
    void utils.god.tenders.list.invalidate()
    void utils.god.tenders.get.invalidate({ id })
  }

  if (detail.isLoading) {
    return (
      <Modal open onClose={onClose} title="פרטי מכרז">
        <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
      </Modal>
    )
  }
  if (detail.isError || !detail.data) {
    return (
      <Modal open onClose={onClose} title="פרטי מכרז">
        <div className="text-center py-6 text-sc-danger text-[13px]">{detail.error?.message ?? 'מכרז לא נמצא'}</div>
      </Modal>
    )
  }

  return (
    <TenderDetailBody t={detail.data} onClose={onClose} onChanged={invalidate} toast={toast} />
  )
}

type Toast = ReturnType<typeof useToast>

function TenderDetailBody({
  t, onClose, onChanged, toast,
}: {
  t: GodTenderDetail
  onClose: () => void
  onChanged: () => void
  toast: Toast
}) {
  const [confirmAwardBid, setConfirmAwardBid] = useState<GodTenderBid | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const setStatusM = trpc.god.tenders.setTenderStatus.useMutation({
    onSuccess: () => { toast.show('סטטוס המכרז עודכן'); onChanged() },
    onError: e => toast.show(e.message),
  })
  const forceAwardM = trpc.god.tenders.forceAward.useMutation({
    onSuccess: r => {
      toast.show(r.linked ? 'הזוכה הוכרז והספק קושר לפרויקט' : 'הזוכה הוכרז (אין פרויקט לקישור)')
      setConfirmAwardBid(null)
      onChanged()
    },
    onError: e => toast.show(e.message),
  })
  const cancelM = trpc.god.tenders.cancelTender.useMutation({
    onSuccess: () => { toast.show('המכרז בוטל'); setConfirmCancel(false); onChanged() },
    onError: e => toast.show(e.message),
  })

  const isAwarded = t.status === 'awarded'
  const isCancelled = t.status === 'cancelled'
  const isTerminal = isAwarded || isCancelled

  // Lifecycle buttons available for a plain status move (awarding excluded).
  const lifecycleTargets: TenderStatus[] = (() => {
    switch (t.status) {
      case 'draft': return ['open', 'closed']
      case 'open': return ['closed']
      case 'closed': return ['open'] // reopen
      default: return []
    }
  })()

  return (
    <Modal
      open
      onClose={onClose}
      title={`מכרז: ${t.title || t.id}`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>סגור</Button>
        </div>
      }
    >
      <div className="space-y-5 text-[13px]">
        {/* Summary */}
        <div className="space-y-1">
          <Row label="סטטוס" value={<Pill kind={statusPillKind(t.status)}>{statusLabel(t.status)}</Pill>} />
          <Row label="בניין" value={t.building_address || '—'} />
          <Row
            label="תקציב"
            value={
              t.budget_min != null || t.budget_max != null
                ? `${money(t.budget_min)} – ${money(t.budget_max)}`
                : '—'
            }
          />
          {t.scope && <Row label="היקף" value={t.scope} />}
          {t.description && <Row label="תיאור" value={t.description} />}
          {t.awarded_provider_id && (
            <Row
              label="זוכה"
              value={<Pill kind="gold"><Trophy size={11} /> {t.awarded_provider_name || t.awarded_provider_id}</Pill>}
            />
          )}
        </div>

        {/* Lifecycle controls */}
        <Section title="סטטוס מכרז">
          {isTerminal ? (
            <div className="text-sc-text-secondary">
              {isAwarded
                ? 'המכרז הוכרז זוכה — לא ניתן לשנות סטטוס דרך מסך זה.'
                : 'המכרז בוטל — אין פעולות סטטוס זמינות.'}
            </div>
          ) : !lifecycleTargets.length ? (
            <div className="text-sc-text-secondary">אין מעברי סטטוס זמינים.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {lifecycleTargets.map(target => (
                <Button
                  key={target}
                  size="sm"
                  variant="secondary"
                  loading={setStatusM.isLoading}
                  onClick={() => setStatusM.mutate({ id: t.id, status: target })}
                >
                  {target === 'open' && t.status === 'closed' ? 'פתח מחדש' : statusLabel(target)}
                </Button>
              ))}
            </div>
          )}
        </Section>

        {/* Bids */}
        <Section title={`הצעות (${t.bids.length})`}>
          {!t.bids.length ? (
            <div className="text-sc-text-secondary">לא הוגשו הצעות למכרז זה.</div>
          ) : (
            <div className="space-y-2">
              {t.bids.map(b => (
                <BidRow
                  key={b.id}
                  b={b}
                  canAward={!isAwarded && !isCancelled}
                  onAward={() => setConfirmAwardBid(b)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Danger zone — force cancel */}
        <Section title="אזור מסוכן" danger>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sc-text-secondary">
              {isCancelled
                ? 'המכרז כבר מבוטל.'
                : 'ביטול מכרז כפוי. פעולה נרשמת ביומן הביקורת.'}
            </div>
            <Button
              size="sm"
              variant="danger"
              icon={<Ban size={14} />}
              disabled={isCancelled}
              onClick={() => setConfirmCancel(true)}
            >בטל מכרז</Button>
          </div>
        </Section>
      </div>

      {/* forceAward interlock — type the tender title */}
      <DangerConfirm
        open={!!confirmAwardBid}
        onClose={() => setConfirmAwardBid(null)}
        title="הכרזת זוכה כפויה"
        confirmText={t.title ?? ''}
        confirmLabel="הכרז זוכה"
        loading={forceAwardM.isLoading}
        onConfirm={() =>
          confirmAwardBid &&
          forceAwardM.mutate({ id: t.id, bid_id: confirmAwardBid.id, confirm: t.title ?? '' })
        }
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0">פעולה עוקפת את תהליך ההצבעה הרגיל!</p>
            <p className="m-0">
              ההצעה של <b>{confirmAwardBid?.provider_name || confirmAwardBid?.provider_id}</b>
              {confirmAwardBid?.amount != null && <> בסך {money(confirmAwardBid.amount)}</>} תוכרז כזוכה.
              כל יתר ההצעות יידחו, המכרז יסומן "זכה", והספק יקושר לפרויקט הבניין.
            </p>
          </div>
        }
      />

      {/* cancelTender interlock — type the tender title */}
      <DangerConfirm
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="ביטול מכרז"
        confirmText={t.title ?? ''}
        confirmLabel="בטל מכרז"
        loading={cancelM.isLoading}
        onConfirm={() => cancelM.mutate({ id: t.id, confirm: t.title ?? '' })}
        body={
          <div className="space-y-2">
            <p className="m-0">המכרז יסומן כמבוטל. לא ניתן יהיה להגיש הצעות חדשות.</p>
          </div>
        }
      />
    </Modal>
  )
}

function BidRow({
  b, canAward, onAward,
}: {
  b: GodTenderBid
  canAward: boolean
  onAward: () => void
}) {
  return (
    <div
      className={`p-3 rounded-sc-input border ${
        b.is_awarded ? 'border-sc-gold bg-sc-cream/40' : 'border-sc-border bg-white'
      }`}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="font-semibold text-[14px]">{b.provider_name || '(ספק לא ידוע)'}</div>
        {b.provider_type && <Pill kind="navy">{b.provider_type}</Pill>}
        <Pill kind={bidStatusKind(b.status)}>{TENDER_BID_STATUS_LABEL[b.status as TenderBidStatus] ?? b.status}</Pill>
        {b.is_awarded && <Pill kind="gold"><Trophy size={11} /> זוכה</Pill>}
        <div className="flex-1" />
        <div className="font-bold text-[15px]">{money(b.amount)}</div>
      </div>
      <div className="text-[11px] text-sc-text-muted mt-1 flex flex-wrap gap-2">
        {b.provider_email && <span>{b.provider_email}</span>}
        {b.eta_weeks != null && <span>· {b.eta_weeks} שבועות</span>}
        {b.scope_summary && <span>· {b.scope_summary}</span>}
      </div>
      {canAward && (
        <div className="flex justify-end mt-2">
          <Button size="sm" variant="gold" icon={<Award size={14} />} onClick={onAward}>
            הכרז זוכה
          </Button>
        </div>
      )}
    </div>
  )
}

function Section({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <div className={`rounded-sc-input border p-3 ${danger ? 'border-sc-danger bg-sc-danger-bg/30' : 'border-sc-border'}`}>
      <div className={`font-bold text-[13px] mb-2 ${danger ? 'text-sc-danger' : 'text-sc-text'}`}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <div className="text-sc-text-secondary w-32 shrink-0">{label}</div>
      <div className="flex-1 break-words">{value}</div>
    </div>
  )
}
