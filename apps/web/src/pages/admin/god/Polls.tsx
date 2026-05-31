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
import { Vote, Plus, Gavel, RotateCcw, Crown, Trash2, ShieldAlert } from 'lucide-react'
import {
  POLL_KINDS,
  POLL_KIND_LABEL,
  POLL_STATUSES,
  POLL_STATUS_LABEL,
  type PollKind,
  type PollStatus,
  type GodPollListItem,
  type GodPollDetail,
  type GodPollOption,
} from '@asset-rise/shared/schemas/godPolls'

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[14px]'

function kindLabel(k: string | null | undefined): string {
  if (!k) return '—'
  return POLL_KIND_LABEL[k as PollKind] ?? k
}

function statusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return POLL_STATUS_LABEL[s as PollStatus] ?? s
}

function statusPillKind(s: string | null | undefined): React.ComponentProps<typeof Pill>['kind'] {
  switch (s) {
    case 'open': return 'success'
    case 'finalized': return 'gold'
    case 'closed': return 'warning'
    case 'expired': return 'danger'
    default: return 'neutral'
  }
}

// God-mode Polls / Elections. List/search polls (+ option & vote counts), drill
// into one (options + live read-only tally), create a new poll, and run the
// audited god writes: forceFinalize (status→finalized), reopen (status→open),
// and overrideResult (DangerConfirm typing the question — sets result_user_id /
// status DIRECTLY, BYPASSING the tally + threshold). Every action is recorded in
// the audit log.
export default function GodPolls() {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const list = trpc.god.polls.list.useQuery(
    {
      q: q.trim() || undefined,
      kind: (kind || undefined) as PollKind | undefined,
      status: (status || undefined) as PollStatus | undefined,
      limit: 200,
    },
    { keepPreviousData: true },
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>הצבעות ובחירות</h1>
      </div>

      <ControlPanel
        title="ניהול הצבעות ובחירות — מנהל-על"
        description="יצירת הצבעה חדשה, הכרעה כפויה (סטטוס → הוכרע), פתיחה מחדש, וקביעת תוצאה ידנית (קובעת זוכה / סטטוס ישירות — עוקף את ספירת הקולות ואחוז הסף). כל פעולה נרשמת ביומן הביקורת."
        tone="danger"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className={inputCls}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="חיפוש לפי שאלת ההצבעה…"
          />
          <select className={`${inputCls} sm:w-44`} value={kind} onChange={e => setKind(e.target.value)}>
            <option value="">כל הסוגים</option>
            {POLL_KINDS.map(k => (
              <option key={k} value={k}>{POLL_KIND_LABEL[k]}</option>
            ))}
          </select>
          <select className={`${inputCls} sm:w-44`} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            {POLL_STATUSES.map(s => (
              <option key={s} value={s}>{POLL_STATUS_LABEL[s]}</option>
            ))}
          </select>
          <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            הצבעה חדשה
          </Button>
        </div>
      </ControlPanel>

      <Card className="mt-4">
        <CardHeader title="הצבעות" meta={<Pill kind="info">{list.data?.length ?? 0}</Pill>} />
        <CardBody>
          {list.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : list.isError ? (
            <div className="text-center py-6 text-sc-danger text-[13px]">{list.error.message}</div>
          ) : !list.data?.length ? (
            <EmptyState icon={<Vote size={28} />} title="אין הצבעות" body="לא נמצאו הצבעות התואמות את הסינון." />
          ) : (
            <div className="space-y-2">
              {list.data.map(p => (
                <PollRow key={p.id} p={p} onOpen={() => setActiveId(p.id)} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {activeId && <PollDetail id={activeId} onClose={() => setActiveId(null)} />}
      {creating && <CreatePollModal onClose={() => setCreating(false)} />}
    </div>
  )
}

function PollRow({ p, onOpen }: { p: GodPollListItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-right p-3 rounded-sc-input border border-sc-border bg-white hover:bg-sc-bg/60 transition-colors"
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="font-semibold text-[14px]">{p.question || '(ללא שאלה)'}</div>
        <Pill kind="navy">{kindLabel(p.kind)}</Pill>
        <Pill kind={statusPillKind(p.status)}>{statusLabel(p.status)}</Pill>
        {p.result_user_id && <Pill kind="gold"><Crown size={11} /> תוצאה נקבעה</Pill>}
        <div className="flex-1" />
        <Pill kind="info">{p.vote_count} קולות</Pill>
      </div>
      <div className="text-[11px] text-sc-text-muted mt-1 flex flex-wrap gap-2">
        {p.building_address && <span>{p.building_address}</span>}
        <span>· {p.option_count} אפשרויות</span>
        {p.threshold_pct != null && <span>· סף {p.threshold_pct}%</span>}
      </div>
    </button>
  )
}

function PollDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useContext()
  const detail = trpc.god.polls.get.useQuery({ id })

  const invalidate = () => {
    void utils.god.polls.list.invalidate()
    void utils.god.polls.get.invalidate({ id })
  }

  if (detail.isLoading) {
    return (
      <Modal open onClose={onClose} title="פרטי הצבעה">
        <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
      </Modal>
    )
  }
  if (detail.isError || !detail.data) {
    return (
      <Modal open onClose={onClose} title="פרטי הצבעה">
        <div className="text-center py-6 text-sc-danger text-[13px]">{detail.error?.message ?? 'הצבעה לא נמצאה'}</div>
      </Modal>
    )
  }

  return <PollDetailBody p={detail.data} onClose={onClose} onChanged={invalidate} toast={toast} />
}

type Toast = ReturnType<typeof useToast>

function PollDetailBody({
  p, onClose, onChanged, toast,
}: {
  p: GodPollDetail
  onClose: () => void
  onChanged: () => void
  toast: Toast
}) {
  const [overrideOpen, setOverrideOpen] = useState(false)

  const finalizeM = trpc.god.polls.forceFinalize.useMutation({
    onSuccess: () => { toast.show('ההצבעה הוכרעה'); onChanged() },
    onError: e => toast.show(e.message),
  })
  const reopenM = trpc.god.polls.reopen.useMutation({
    onSuccess: () => { toast.show('ההצבעה נפתחה מחדש'); onChanged() },
    onError: e => toast.show(e.message),
  })

  const isFinalized = p.status === 'finalized'
  const isOpen = p.status === 'open'

  return (
    <Modal
      open
      onClose={onClose}
      title={`הצבעה: ${p.question || p.id}`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>סגור</Button>
        </div>
      }
    >
      <div className="space-y-5 text-[13px]">
        {/* Summary */}
        <div className="space-y-1">
          <Row label="סוג" value={<Pill kind="navy">{kindLabel(p.kind)}</Pill>} />
          <Row label="סטטוס" value={<Pill kind={statusPillKind(p.status)}>{statusLabel(p.status)}</Pill>} />
          <Row label="בניין" value={p.building_address || '—'} />
          <Row label="אחוז סף" value={p.threshold_pct != null ? `${p.threshold_pct}%` : '—'} />
          {p.description && <Row label="תיאור" value={p.description} />}
          {p.result_user_id && (
            <Row
              label="תוצאה"
              value={<Pill kind="gold"><Crown size={11} /> {p.result_user_name || p.result_user_id}</Pill>}
            />
          )}
        </div>

        {/* Read-only tally */}
        <Section title={`ספירת קולות (${p.total_votes} סה״כ)`}>
          {!p.options.length ? (
            <div className="text-sc-text-secondary">להצבעה זו אין אפשרויות.</div>
          ) : (
            <div className="space-y-2">
              {p.options.map(o => (
                <TallyRow key={o.id} o={o} isWinner={!!p.result_user_id && o.user_id === p.result_user_id} />
              ))}
            </div>
          )}
        </Section>

        {/* Lifecycle controls */}
        <Section title="פעולות סטטוס">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Gavel size={14} />}
              loading={finalizeM.isLoading}
              disabled={isFinalized}
              onClick={() => finalizeM.mutate({ id: p.id })}
            >
              {isFinalized ? 'כבר הוכרע' : 'הכרע כפוי'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={<RotateCcw size={14} />}
              loading={reopenM.isLoading}
              disabled={isOpen}
              onClick={() => reopenM.mutate({ id: p.id })}
            >
              {isOpen ? 'כבר פתוחה' : 'פתח מחדש'}
            </Button>
          </div>
        </Section>

        {/* Danger zone — override result */}
        <Section title="אזור מסוכן" danger>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sc-text-secondary">
              קביעת תוצאה / סטטוס ידנית — עוקף את ספירת הקולות ואחוז הסף. נרשם ביומן הביקורת.
            </div>
            <Button
              size="sm"
              variant="danger"
              icon={<ShieldAlert size={14} />}
              onClick={() => setOverrideOpen(true)}
            >
              קבע תוצאה
            </Button>
          </div>
        </Section>
      </div>

      {overrideOpen && (
        <OverrideResultModal
          p={p}
          onClose={() => setOverrideOpen(false)}
          onChanged={() => { setOverrideOpen(false); onChanged() }}
          toast={toast}
        />
      )}
    </Modal>
  )
}

function TallyRow({ o, isWinner }: { o: GodPollOption; isWinner: boolean }) {
  return (
    <div
      className={`p-2.5 rounded-sc-input border ${
        isWinner ? 'border-sc-gold bg-sc-cream/40' : 'border-sc-border bg-white'
      }`}
    >
      <div className="flex items-baseline gap-2">
        <div className="font-semibold text-[13px]">{o.user_name || o.label || '(ללא תווית)'}</div>
        {isWinner && <Pill kind="gold"><Crown size={11} /> זוכה</Pill>}
        <div className="flex-1" />
        <div className="font-bold text-[13px]">{o.vote_count} ({o.vote_pct}%)</div>
      </div>
      {/* Read-only tally bar */}
      <div className="mt-1.5 h-2 rounded-full bg-sc-bg overflow-hidden">
        <div
          className={`h-full ${isWinner ? 'bg-sc-gold' : 'bg-sc-blue'}`}
          style={{ width: `${o.vote_pct}%` }}
        />
      </div>
    </div>
  )
}

// overrideResult interlock — pick the winning option (or clear) and/or a status,
// then DangerConfirm by typing the poll question.
function OverrideResultModal({
  p, onClose, onChanged, toast,
}: {
  p: GodPollDetail
  onClose: () => void
  onChanged: () => void
  toast: Toast
}) {
  // Options that carry a candidate user_id can be the result winner.
  const candidateOptions = p.options.filter(o => o.user_id)
  const [setResult, setSetResult] = useState(false)
  const [resultUserId, setResultUserId] = useState<string>('')
  const [setStatus, setSetStatus] = useState(false)
  const [statusVal, setStatusVal] = useState<PollStatus>('finalized')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const overrideM = trpc.god.polls.overrideResult.useMutation({
    onSuccess: () => { toast.show('התוצאה נקבעה ידנית'); onChanged() },
    onError: e => toast.show(e.message),
  })

  const nothingSelected = !setResult && !setStatus

  return (
    <Modal
      open
      onClose={onClose}
      title="קביעת תוצאה ידנית"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
          <Button
            variant="danger"
            disabled={nothingSelected}
            onClick={() => setConfirmOpen(true)}
          >
            המשך
          </Button>
        </div>
      }
    >
      <div className="space-y-4 text-[13px]">
        <p className="text-sc-danger font-semibold m-0">
          פעולה עוקפת את ספירת הקולות ואת אחוז הסף — קובעת את התוצאה ישירות.
        </p>

        {/* Result winner */}
        <div className="rounded-sc-input border border-sc-border p-3 space-y-2">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={setResult} onChange={e => setSetResult(e.target.checked)} />
            קבע זוכה (result_user_id)
          </label>
          {setResult && (
            <select
              className={inputCls}
              value={resultUserId}
              onChange={e => setResultUserId(e.target.value)}
            >
              <option value="">— נקה תוצאה (ללא זוכה) —</option>
              {candidateOptions.map(o => (
                <option key={o.id} value={o.user_id ?? ''}>
                  {o.user_name || o.label || o.user_id} · {o.vote_count} קולות
                </option>
              ))}
            </select>
          )}
          {setResult && !candidateOptions.length && (
            <div className="text-[11px] text-sc-text-muted">
              להצבעה זו אין אפשרויות עם מועמד משויך — ניתן רק לנקות את התוצאה.
            </div>
          )}
        </div>

        {/* Status */}
        <div className="rounded-sc-input border border-sc-border p-3 space-y-2">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={setStatus} onChange={e => setSetStatus(e.target.checked)} />
            קבע סטטוס
          </label>
          {setStatus && (
            <select
              className={inputCls}
              value={statusVal}
              onChange={e => setStatusVal(e.target.value as PollStatus)}
            >
              {POLL_STATUSES.map(s => (
                <option key={s} value={s}>{POLL_STATUS_LABEL[s]}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <DangerConfirm
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="אישור קביעת תוצאה"
        confirmText={p.question ?? ''}
        confirmLabel="קבע תוצאה"
        loading={overrideM.isLoading}
        onConfirm={() =>
          overrideM.mutate({
            id: p.id,
            set_result: setResult,
            result_user_id: setResult ? (resultUserId || null) : undefined,
            status: setStatus ? statusVal : undefined,
            confirm: p.question ?? '',
          })
        }
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0">פעולה עוקפת את ספירת הקולות!</p>
            <p className="m-0">
              {setResult && (
                <>הזוכה ייקבע ל-<b>{resultUserId
                  ? (candidateOptions.find(o => o.user_id === resultUserId)?.user_name || resultUserId)
                  : '(ללא זוכה — ניקוי)'}</b>. </>
              )}
              {setStatus && <>הסטטוס ייקבע ל-<b>{POLL_STATUS_LABEL[statusVal]}</b>. </>}
            </p>
          </div>
        }
      />
    </Modal>
  )
}

// createPoll — author a new poll on a building with dynamic option rows.
function CreatePollModal({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useContext()
  const buildings = trpc.god.polls.buildingOptions.useQuery()

  const [buildingId, setBuildingId] = useState('')
  const [kind, setKind] = useState<PollKind>('decision')
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [thresholdPct, setThresholdPct] = useState('51')
  const [deadline, setDeadline] = useState('')
  const [options, setOptions] = useState<string[]>([''])

  const createM = trpc.god.polls.createPoll.useMutation({
    onSuccess: () => {
      toast.show('ההצבעה נוצרה')
      void utils.god.polls.list.invalidate()
      onClose()
    },
    onError: e => toast.show(e.message),
  })

  const cleanOptions = options.map(o => o.trim()).filter(Boolean)
  const canSubmit = !!buildingId && question.trim().length > 0

  const submit = () => {
    const th = Number(thresholdPct)
    createM.mutate({
      building_id: buildingId,
      kind,
      question: question.trim(),
      description: description.trim() || null,
      threshold_pct: Number.isFinite(th) && th >= 1 && th <= 100 ? th : undefined,
      deadline_at: deadline ? new Date(deadline).toISOString() : null,
      options: cleanOptions.length ? cleanOptions.map(label => ({ label })) : undefined,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="הצבעה חדשה"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
          <Button disabled={!canSubmit} loading={createM.isLoading} onClick={submit}>צור הצבעה</Button>
        </div>
      }
    >
      <div className="space-y-3 text-[13px]">
        <Field label="בניין">
          <select className={inputCls} value={buildingId} onChange={e => setBuildingId(e.target.value)}>
            <option value="">— בחר/י בניין —</option>
            {(buildings.data ?? []).map(b => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </Field>

        <Field label="סוג">
          <select className={inputCls} value={kind} onChange={e => setKind(e.target.value as PollKind)}>
            {POLL_KINDS.map(k => (
              <option key={k} value={k}>{POLL_KIND_LABEL[k]}</option>
            ))}
          </select>
        </Field>

        <Field label="שאלה">
          <input className={inputCls} value={question} onChange={e => setQuestion(e.target.value)} placeholder="שאלת ההצבעה…" />
        </Field>

        <Field label="תיאור (אופציונלי)">
          <textarea className={inputCls} rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="אחוז סף">
            <input className={inputCls} type="number" min={1} max={100} value={thresholdPct} onChange={e => setThresholdPct(e.target.value)} />
          </Field>
          <Field label="תאריך יעד (אופציונלי)">
            <input className={inputCls} type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
          </Field>
        </div>

        <Field label="אפשרויות (אופציונלי)">
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={inputCls}
                  value={opt}
                  onChange={e => setOptions(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
                  placeholder={`אפשרות ${i + 1}`}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={() => setOptions(prev => (prev.length > 1 ? prev.filter((_, j) => j !== i) : ['']))}
                />
              </div>
            ))}
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setOptions(prev => [...prev, ''])}>
              הוסף אפשרות
            </Button>
          </div>
        </Field>
      </div>
    </Modal>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sc-text-secondary mb-1">{label}</div>
      {children}
    </div>
  )
}
