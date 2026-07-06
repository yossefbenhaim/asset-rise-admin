import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { trpc } from '@/lib/api/trpc'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { DataTable } from '@/components/ui/DataTable'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DangerConfirm } from '@/components/ui/DangerConfirm'
import { useToast } from '@/components/ui/Toast'
import { GitBranch, Link2, Link2Off, MessageSquare, ShieldAlert } from 'lucide-react'
import {
  NEGOTIATION_STAGES,
  NEGOTIATION_STAGE_LABEL,
  NEGOTIATION_STATUSES,
  NEGOTIATION_STATUS_LABEL,
  type NegotiationStage,
  type NegotiationStatus,
  type GodNegotiationListItem,
  type GodNegotiationDetail,
} from '@asset-rise/shared'

// God-mode "Provider Negotiations" page (Wave 2 — "deals"). Lists all
// sc_provider_negotiations with parties/status/stage/project/building, drills
// into one (+ messages), and runs the audited god writes:
//   forceStage   — set stage to any of the 9
//   forceStatus  — set status to any of the 6 (confirmed/rejected/cancelled
//                  BYPASS the tenant poll — surfaced with a Hebrew warning)
//   linkProvider — insert sc_project_providers (bypasses the finalize flow)
//   unlinkProvider — delete that row (DangerConfirm)
//
// The god.negotiations router is an isolated sibling that the integration step
// merges into the god router; until that lands its procedures aren't on the
// typed tRPC client, so this page reaches them through a thin typed accessor.
// All call sites stay strongly typed against the shared schema interfaces.
const god = trpc as unknown as {
  god: {
    negotiations: {
      list: {
        useQuery: (
          input: {
            status?: NegotiationStatus
            stage?: NegotiationStage
            building_id?: string
            project_id?: string
            q?: string
            limit?: number
          },
          opts?: { keepPreviousData?: boolean },
        ) => {
          data?: GodNegotiationListItem[]
          isLoading: boolean
          isError: boolean
          error: { message: string } | null
        }
        invalidate: () => Promise<void>
      }
      get: {
        useQuery: (input: { id: string }) => {
          data?: GodNegotiationDetail
          isLoading: boolean
          isError: boolean
          error: { message: string } | null
        }
        invalidate: (input: { id: string }) => Promise<void>
      }
      forceStage: { useMutation: (o: MutOpts) => Mut<{ id: string; stage: NegotiationStage }> }
      forceStatus: { useMutation: (o: MutOpts) => Mut<{ id: string; status: NegotiationStatus }> }
      linkProvider: {
        useMutation: (o: MutOpts) => Mut<{
          id: string
          project_id?: string
          provider_id?: string
          provider_type?: string
        }>
      }
      unlinkProvider: {
        useMutation: (
          o: MutOpts,
        ) => Mut<{ id: string; project_id?: string; provider_id?: string; confirm: string }>
      }
    }
  }
}

type MutOpts = { onSuccess?: () => void; onError?: (e: { message: string }) => void }
type Mut<TInput> = { mutate: (input: TInput) => void; isLoading: boolean }

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[13px]'
const labelCls = 'text-[12px] text-sc-text-secondary mb-1 block'

function stageLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return (NEGOTIATION_STAGE_LABEL as Record<string, string>)[s] ?? s
}
function statusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return (NEGOTIATION_STATUS_LABEL as Record<string, string>)[s] ?? s
}
function statusPillKind(s: string | null | undefined): string {
  switch (s) {
    case 'confirmed':
      return 'success'
    case 'rejected':
    case 'cancelled':
      return 'danger'
    case 'tenant_voting':
    case 'mutual_agreed':
      return 'gold'
    case 'open':
      return 'info'
    default:
      return 'neutral'
  }
}

type NegRow = GodNegotiationListItem & Record<string, unknown>

const columns: ColumnDef<NegRow, unknown>[] = [
  {
    id: 'building',
    header: 'בניין',
    accessorFn: r => r.building_address ?? '',
    cell: ({ row }) => (
      <span className="font-semibold">{row.original.building_address ?? '—'}</span>
    ),
  },
  {
    id: 'project',
    header: 'פרויקט',
    accessorFn: r => r.project_name ?? '',
    cell: ({ row }) => row.original.project_name ?? '—',
  },
  {
    id: 'chair',
    header: 'יו״ר',
    accessorFn: r => r.chair_name ?? '',
    cell: ({ row }) => <span className="text-[12px]">{row.original.chair_name ?? '—'}</span>,
  },
  {
    id: 'provider',
    header: 'ספק',
    accessorFn: r => r.provider_name ?? '',
    cell: ({ row }) => <span className="text-[12px]">{row.original.provider_name ?? '—'}</span>,
  },
  {
    id: 'provider_type',
    header: 'סוג',
    accessorFn: r => r.provider_type ?? '',
    cell: ({ row }) =>
      row.original.provider_type ? <Pill kind="gold">{row.original.provider_type}</Pill> : <>—</>,
  },
  {
    id: 'status',
    header: 'סטטוס',
    accessorFn: r => statusLabel(r.status),
    cell: ({ row }) => (
      <Pill kind={statusPillKind(row.original.status) as any}>
        {statusLabel(row.original.status)}
      </Pill>
    ),
  },
  {
    id: 'stage',
    header: 'שלב',
    accessorFn: r => stageLabel(r.stage),
    cell: ({ row }) => <Pill kind="neutral">{stageLabel(row.original.stage)}</Pill>,
  },
  {
    id: 'message_count',
    header: 'הודעות',
    accessorFn: r => r.message_count,
    cell: ({ row }) => row.original.message_count,
  },
]

export default function GodNegotiations() {
  const [status, setStatus] = useState('')
  const [stage, setStage] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const list = god.god.negotiations.list.useQuery(
    {
      status: (status || undefined) as NegotiationStatus | undefined,
      stage: (stage || undefined) as NegotiationStage | undefined,
      limit: 200,
    },
    { keepPreviousData: true },
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>משא ומתן עם ספקים — מנהל-על</h1>
      </div>

      <ControlPanel
        title="שליטה במשא ומתן"
        description="כפיית שלב/סטטוס, שיוך והסרת שיוך של ספק לפרויקט. כפיית סטטוס מאושר/נדחה/בוטל וכן שיוך/הסרה עוקפים את הצבעת הדיירים ואת תהליך הסגירה הרגיל. כל פעולה נרשמת ביומן הביקורת."
        tone="danger"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            className={`${inputCls} sm:w-48`}
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="">כל הסטטוסים</option>
            {NEGOTIATION_STATUSES.map(s => (
              <option key={s} value={s}>
                {NEGOTIATION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            className={`${inputCls} sm:w-48`}
            value={stage}
            onChange={e => setStage(e.target.value)}
          >
            <option value="">כל השלבים</option>
            {NEGOTIATION_STAGES.map(s => (
              <option key={s} value={s}>
                {NEGOTIATION_STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </ControlPanel>

      {list.isError && <p className="text-sc-danger text-[13px] mb-2">{list.error?.message}</p>}

      <div className="mt-4">
        <DataTable<NegRow>
          columns={columns}
          data={(list.data ?? []) as NegRow[]}
          loading={list.isLoading}
          onRowClick={n => setActiveId(n.id)}
          csvName="negotiations"
          searchPlaceholder="חיפוש משא ומתן…"
          emptyTitle="אין משאים ומתנים"
          emptyBody="לא נמצאו רשומות התואמות את הסינון."
        />
      </div>

      {activeId && <NegotiationDetail id={activeId} onClose={() => setActiveId(null)} />}
    </div>
  )
}

function NegotiationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = god.god.negotiations.get.useQuery({ id })

  if (detail.isLoading) {
    return (
      <Modal open onClose={onClose} title="פרטי משא ומתן">
        <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
      </Modal>
    )
  }
  if (detail.isError || !detail.data) {
    return (
      <Modal open onClose={onClose} title="פרטי משא ומתן">
        <div className="text-center py-6 text-sc-danger text-[13px]">
          {detail.error?.message ?? 'לא נמצא'}
        </div>
      </Modal>
    )
  }
  return <NegotiationDetailBody n={detail.data} onClose={onClose} />
}

function NegotiationDetailBody({ n, onClose }: { n: GodNegotiationDetail; onClose: () => void }) {
  const toast = useToast()
  const [unlinkOpen, setUnlinkOpen] = useState(false)
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false)

  function refresh() {
    void god.god.negotiations.get.invalidate({ id: n.id })
    void god.god.negotiations.list.invalidate()
  }

  const forceStageM = god.god.negotiations.forceStage.useMutation({
    onSuccess: () => {
      toast.show('שלב המשא ומתן עודכן')
      refresh()
    },
    onError: e => toast.show(e.message),
  })
  const forceStatusM = god.god.negotiations.forceStatus.useMutation({
    onSuccess: () => {
      toast.show('סטטוס המשא ומתן עודכן')
      setStatusConfirmOpen(false)
      refresh()
    },
    onError: e => toast.show(e.message),
  })
  const linkM = god.god.negotiations.linkProvider.useMutation({
    onSuccess: () => {
      toast.show('הספק שויך לפרויקט')
      refresh()
    },
    onError: e => toast.show(e.message),
  })
  const unlinkM = god.god.negotiations.unlinkProvider.useMutation({
    onSuccess: () => {
      toast.show('שיוך הספק הוסר')
      setUnlinkOpen(false)
      refresh()
    },
    onError: e => toast.show(e.message),
  })

  const [stage, setStage] = useState<string>(n.stage ?? 'contact')
  const [status, setStatus] = useState<string>(n.status ?? 'open')

  const statusOverrides = status === 'confirmed' || status === 'rejected' || status === 'cancelled'
  const canLink = !!n.project_id && !!n.provider_id
  const unlinkToken = n.provider_name || n.provider_email || n.provider_id || 'ספק'

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`משא ומתן: ${n.provider_name || n.provider_email || n.id}`}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>
              סגור
            </Button>
          </div>
        }
      >
        <div className="space-y-5 text-[13px]">
          {/* Summary */}
          <div className="space-y-1">
            <Row label="בניין" value={n.building_address || '—'} />
            <Row label="פרויקט" value={n.project_name || '—'} />
            <Row
              label="יו״ר"
              value={
                n.chair_name ? `${n.chair_name}${n.chair_email ? ` · ${n.chair_email}` : ''}` : '—'
              }
            />
            <Row
              label="ספק"
              value={
                n.provider_name
                  ? `${n.provider_name}${n.provider_email ? ` · ${n.provider_email}` : ''}`
                  : '—'
              }
            />
            <Row
              label="סוג ספק"
              value={n.provider_type ? <Pill kind="gold">{n.provider_type}</Pill> : '—'}
            />
            <Row
              label="סטטוס נוכחי"
              value={<Pill kind={statusPillKind(n.status) as any}>{statusLabel(n.status)}</Pill>}
            />
            <Row label="שלב נוכחי" value={<Pill kind="neutral">{stageLabel(n.stage)}</Pill>} />
            <Row
              label="שיוך לפרויקט"
              value={
                n.is_linked ? (
                  <Pill kind="success">מקושר</Pill>
                ) : (
                  <Pill kind="neutral">לא מקושר</Pill>
                )
              }
            />
            {n.result_summary && <Row label="סיכום תוצאה" value={n.result_summary} />}
          </div>

          {/* Force stage */}
          <Section title="כפיית שלב" icon={<GitBranch size={15} />}>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className={labelCls}>בחר/י שלב</span>
                <select
                  className={`${inputCls} min-w-[200px]`}
                  value={stage}
                  onChange={e => setStage(e.target.value)}
                >
                  {NEGOTIATION_STAGES.map(s => (
                    <option key={s} value={s}>
                      {NEGOTIATION_STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                size="sm"
                loading={forceStageM.isLoading}
                disabled={stage === n.stage}
                onClick={() => forceStageM.mutate({ id: n.id, stage: stage as NegotiationStage })}
              >
                עדכן שלב
              </Button>
            </div>
          </Section>

          {/* Force status */}
          <Section title="כפיית סטטוס" icon={<ShieldAlert size={15} />} danger>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className={labelCls}>בחר/י סטטוס</span>
                <select
                  className={`${inputCls} min-w-[200px]`}
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                >
                  {NEGOTIATION_STATUSES.map(s => (
                    <option key={s} value={s}>
                      {NEGOTIATION_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                size="sm"
                variant={statusOverrides ? 'danger' : 'primary'}
                loading={forceStatusM.isLoading}
                disabled={status === n.status}
                onClick={() =>
                  statusOverrides
                    ? setStatusConfirmOpen(true)
                    : forceStatusM.mutate({ id: n.id, status: status as NegotiationStatus })
                }
              >
                עדכן סטטוס
              </Button>
            </div>
            {statusOverrides && (
              <p className="text-sc-danger text-[12px] mt-2 m-0">
                שים/י לב: כפיית סטטוס «{statusLabel(status)}» עוקפת את הצבעת הדיירים ואת תהליך
                הסגירה הרגיל. השיוך בפועל של הספק לפרויקט נעשה בנפרד (שיוך ספק).
              </p>
            )}
          </Section>

          {/* Link / unlink provider record */}
          <Section title="שיוך ספק לפרויקט" icon={<Link2 size={15} />} danger>
            <p className="text-sc-text-secondary text-[12px] m-0 mb-2">
              יצירת/הסרת רשומת השיוך (sc_project_providers) ישירות — עוקף את תהליך ההצבעה והסגירה
              הרגיל.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={<Link2 size={14} />}
                loading={linkM.isLoading}
                disabled={!canLink || n.is_linked}
                onClick={() => linkM.mutate({ id: n.id })}
              >
                {n.is_linked ? 'כבר מקושר' : 'שייך ספק לפרויקט'}
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Link2Off size={14} />}
                disabled={!canLink || !n.is_linked}
                onClick={() => setUnlinkOpen(true)}
              >
                הסר שיוך
              </Button>
            </div>
            {!canLink && (
              <p className="text-sc-text-muted text-[12px] mt-2 m-0">
                נדרשים פרויקט וספק משויכים למשא ומתן כדי לבצע שיוך/הסרה.
              </p>
            )}
          </Section>

          {/* Messages */}
          <Section title={`הודעות (${n.messages.length})`} icon={<MessageSquare size={15} />}>
            {!n.messages.length ? (
              <div className="text-sc-text-secondary">אין הודעות במשא ומתן זה.</div>
            ) : (
              <div className="space-y-2 max-h-[260px] overflow-y-auto">
                {n.messages.map(m => (
                  <div key={m.id} className="border border-sc-border rounded-sc-input p-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-[12px]">
                        {m.sender_name || '(לא ידוע)'}
                      </span>
                      {m.created_at && (
                        <span className="text-[11px] text-sc-text-muted">
                          {new Date(m.created_at).toLocaleString('he-IL')}
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] whitespace-pre-wrap break-words mt-1">
                      {m.body || '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </Modal>

      <DangerConfirm
        open={statusConfirmOpen}
        onClose={() => setStatusConfirmOpen(false)}
        title="כפיית סטטוס משא ומתן"
        confirmText={unlinkToken}
        confirmLabel={`כפה סטטוס «${statusLabel(status)}»`}
        loading={forceStatusM.isLoading}
        onConfirm={() => forceStatusM.mutate({ id: n.id, status: status as NegotiationStatus })}
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0">פעולה הרסנית!</p>
            <p className="m-0">
              כפיית סטטוס «{statusLabel(status)}» תקבע את תוצאת המשא ומתן ותעקוף את הצבעת הדיירים
              ואת תהליך הסגירה הרגיל. השיוך בפועל של הספק לפרויקט נעשה בנפרד (שיוך ספק).
            </p>
          </div>
        }
      />

      <DangerConfirm
        open={unlinkOpen}
        onClose={() => setUnlinkOpen(false)}
        title="הסרת שיוך ספק"
        confirmText={unlinkToken}
        confirmLabel="הסר שיוך"
        loading={unlinkM.isLoading}
        onConfirm={() => unlinkM.mutate({ id: n.id, confirm: unlinkToken })}
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0">פעולה הרסנית!</p>
            <p className="m-0">
              הסרת השיוך תמחק את רשומת sc_project_providers שמקשרת את הספק לפרויקט. הפעולה עוקפת את
              תהליך הסגירה הרגיל ואינה משנה את סטטוס/שלב המשא ומתן.
            </p>
          </div>
        }
      />
    </>
  )
}

function Section({
  title,
  icon,
  children,
  danger,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <div
      className={`rounded-sc-input border p-3 ${danger ? 'border-sc-danger bg-sc-danger-bg/30' : 'border-sc-border'}`}
    >
      <div
        className={`font-bold text-[13px] mb-2 flex items-center gap-2 ${danger ? 'text-sc-danger' : 'text-sc-text'}`}
      >
        {icon}
        {title}
      </div>
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
