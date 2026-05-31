import { useMemo, useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { DangerConfirm } from '@/components/ui/DangerConfirm'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { Users, Building2, Send, RotateCcw, History } from 'lucide-react'
import type {
  GodBroadcastAudience,
  GodBroadcastPreview,
  GodBroadcastBuilding,
  GodBroadcastSendResult,
  GodBroadcastRecent,
} from '@asset-rise/shared/schemas/godNotifications'

// God-mode "System Broadcast" page (Wave 3 — content + comms). THE MARQUEE
// FEATURE. Compose a 'system.announcement' notification, pick an audience
// (כל המשתמשים / דיירי בניין / לפי תפקיד), preview the recipient COUNT, then
// send behind a DangerConfirm whose token is that count (blast radius!). Also
// lists recent sends (grouped by event_id) and lets the operator resend one.
//
// The god.notifications router is an isolated sibling that the integration step
// merges into the god router; until that lands its procedures aren't on the
// typed tRPC client, so this page reaches them through a thin typed accessor.
// All call sites stay strongly typed against the shared schema interfaces.
type MutOpts<T> = { onSuccess?: (data: T) => void; onError?: (e: { message: string }) => void }
type Mut<TInput, _TOut> = { mutate: (input: TInput) => void; isLoading: boolean }

type SendInput = {
  audience: GodBroadcastAudience
  title: string
  body?: string
  link?: string
  expected_count: number
  confirm: string
}
type ResendInput = SendInput & { source_event_id: string | null }

const god = trpc as unknown as {
  god: {
    notifications: {
      buildings: {
        useQuery: () => {
          data?: GodBroadcastBuilding[]
          isLoading: boolean
          isError: boolean
          error: { message: string } | null
        }
      }
      preview: {
        useQuery: (
          input: { audience: GodBroadcastAudience },
          opts?: { enabled?: boolean; keepPreviousData?: boolean },
        ) => {
          data?: GodBroadcastPreview
          isLoading: boolean
          isFetching: boolean
          isError: boolean
          error: { message: string } | null
        }
      }
      recent: {
        useQuery: (input: { limit?: number }) => {
          data?: GodBroadcastRecent[]
          isLoading: boolean
          isError: boolean
          error: { message: string } | null
          refetch: () => void
        }
      }
      send: { useMutation: (o: MutOpts<GodBroadcastSendResult>) => Mut<SendInput, GodBroadcastSendResult> }
      resend: { useMutation: (o: MutOpts<GodBroadcastSendResult>) => Mut<ResendInput, GodBroadcastSendResult> }
    }
  }
}

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[13px]'
const labelCls = 'block text-[12px] font-semibold text-sc-text-secondary mb-1'

function fmtTime(s: string | null | undefined): string {
  if (!s) return ''
  return new Date(s).toLocaleString('he-IL')
}

type AudienceType = 'all' | 'building' | 'role'

export default function GodBroadcast() {
  const toast = useToast()

  // ── Composer state ──────────────────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')
  const [audienceType, setAudienceType] = useState<AudienceType>('all')
  const [buildingId, setBuildingId] = useState<string>('')
  const [role, setRole] = useState<'tenant' | 'provider'>('tenant')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const buildings = god.god.notifications.buildings.useQuery()
  const recent = god.god.notifications.recent.useQuery({ limit: 50 })

  // The fully-typed audience selector, or null when the selection is incomplete
  // (e.g. "one building" with no building chosen) — preview stays disabled then.
  const audience: GodBroadcastAudience | null = useMemo(() => {
    if (audienceType === 'all') return { type: 'all' }
    if (audienceType === 'role') return { type: 'role', role }
    if (audienceType === 'building' && buildingId) return { type: 'building', building_id: buildingId }
    return null
  }, [audienceType, role, buildingId])

  // Live recipient preview. Disabled until the audience is complete.
  const preview = god.god.notifications.preview.useQuery(
    { audience: (audience ?? { type: 'all' }) as GodBroadcastAudience },
    { enabled: !!audience, keepPreviousData: true },
  )

  const count = preview.data?.count ?? 0
  const audienceLabel = preview.data?.audience_label ?? ''
  const canSend = !!audience && title.trim().length >= 2 && !!preview.data && count > 0

  const sendM = god.god.notifications.send.useMutation({
    onSuccess: data => {
      toast.show(`השידור נשלח ל-${data.sent} נמענים`)
      setConfirmOpen(false)
      setTitle('')
      setBody('')
      setLink('')
      recent.refetch()
    },
    onError: e => {
      toast.show(e.message)
      setConfirmOpen(false)
    },
  })

  function doSend() {
    if (!audience) return
    sendM.mutate({
      audience,
      title: title.trim(),
      body: body.trim() || undefined,
      link: link.trim() || undefined,
      expected_count: count,
      // The DangerConfirm token IS the count — re-sent as the confirm guard.
      confirm: String(count),
    })
  }

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>שידור מערכת — מנהל-על</h1>
      </div>

      <ControlPanel
        title="שליחת הודעת מערכת לכלל המשתמשים"
        description="חיבור הודעת מערכת (system.announcement) והפצתה לקהל יעד: כל המשתמשים, כל דיירי בניין מסוים, או כל בעלי תפקיד מסוים. ההודעה נכנסת לפעמון ההתראות של כל נמען. זוהי הפעולה בעלת ההשפעה הרחבה ביותר במערכת — ראה/י את מספר הנמענים לפני השליחה, והקלד/י אותו לאישור. כל שליחה נרשמת ביומן הביקורת."
        tone="danger"
      >
        <div className="space-y-3">
          <div>
            <label className={labelCls}>כותרת ההודעה</label>
            <input
              className={inputCls}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="לדוגמה: עדכון מערכת חשוב"
              maxLength={160}
            />
          </div>
          <div>
            <label className={labelCls}>תוכן (אופציונלי)</label>
            <textarea
              className={`${inputCls} min-h-[80px] resize-y`}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="גוף ההודעה…"
              maxLength={2000}
            />
          </div>
          <div>
            <label className={labelCls}>קישור (אופציונלי)</label>
            <input
              className={inputCls}
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="/notifications או נתיב בתוך האפליקציה"
              maxLength={500}
            />
          </div>

          <div>
            <label className={labelCls}>קהל יעד</label>
            <div className="flex flex-wrap gap-2">
              <AudienceTab
                active={audienceType === 'all'}
                onClick={() => setAudienceType('all')}
                icon={<Users size={14} />}
                label="כל המשתמשים"
              />
              <AudienceTab
                active={audienceType === 'building'}
                onClick={() => setAudienceType('building')}
                icon={<Building2 size={14} />}
                label="דיירי בניין"
              />
              <AudienceTab
                active={audienceType === 'role'}
                onClick={() => setAudienceType('role')}
                icon={<Users size={14} />}
                label="לפי תפקיד"
              />
            </div>
          </div>

          {audienceType === 'building' && (
            <div>
              <label className={labelCls}>בחר/י בניין</label>
              {buildings.isLoading ? (
                <div className="text-[12px] text-sc-text-secondary">טוען בניינים…</div>
              ) : (
                <select
                  className={inputCls}
                  value={buildingId}
                  onChange={e => setBuildingId(e.target.value)}
                >
                  <option value="">— בחר/י בניין —</option>
                  {(buildings.data ?? []).map(b => (
                    <option key={b.id} value={b.id}>
                      {(b.address ?? b.id)} · {b.tenant_count} דיירים
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {audienceType === 'role' && (
            <div>
              <label className={labelCls}>תפקיד</label>
              <select
                className={inputCls}
                value={role}
                onChange={e => setRole(e.target.value as 'tenant' | 'provider')}
              >
                <option value="tenant">דיירים</option>
                <option value="provider">נותני שירות</option>
              </select>
            </div>
          )}

          {/* Live blast-radius preview */}
          <div className="rounded-sc-input border border-sc-border bg-sc-surface-2 p-3">
            {!audience ? (
              <div className="text-[12px] text-sc-text-secondary">בחר/י קהל יעד כדי לראות את מספר הנמענים.</div>
            ) : preview.isLoading || preview.isFetching ? (
              <div className="text-[12px] text-sc-text-secondary">מחשב נמענים…</div>
            ) : preview.isError ? (
              <div className="text-[12px] text-sc-danger">{preview.error?.message}</div>
            ) : (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[13px]">
                  <span className="text-sc-text-secondary">קהל יעד: </span>
                  <span className="font-semibold">{audienceLabel}</span>
                </div>
                <Pill kind={count > 0 ? 'danger' : 'neutral'}>{count} נמענים</Pill>
              </div>
            )}
            {preview.data && preview.data.sample.length > 0 && (
              <div className="text-[11px] text-sc-text-muted mt-2">
                לדוגמה:{' '}
                {preview.data.sample
                  .map(s => s.name || s.email || s.id.slice(0, 8))
                  .slice(0, 8)
                  .join(', ')}
                {count > preview.data.sample.length ? ' ועוד…' : ''}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              variant="danger"
              icon={<Send size={14} />}
              disabled={!canSend}
              onClick={() => setConfirmOpen(true)}
            >
              שלח שידור
            </Button>
          </div>
        </div>
      </ControlPanel>

      <RecentSends recent={recent} toast={toast} />

      <DangerConfirm
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="שליחת שידור מערכת"
        confirmText={String(count)}
        confirmLabel={`שלח ל-${count} נמענים`}
        loading={sendM.isLoading}
        onConfirm={doSend}
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0">פעולה בעלת השפעה רחבה!</p>
            <p className="m-0">
              ההודעה «{title.trim()}» תישלח ל<strong> {count} נמענים</strong> ({audienceLabel}).
              ההודעה תופיע בפעמון ההתראות של כל נמען מיד.
            </p>
            <p className="m-0 text-sc-text-secondary">
              להמשך, הקלד/י את מספר הנמענים <strong>{count}</strong> בתיבה למטה.
            </p>
          </div>
        }
      />
    </div>
  )
}

function AudienceTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-sc-input border px-3 py-1.5 text-[12px] font-semibold transition ${
        active
          ? 'border-sc-danger bg-sc-danger-bg/40 text-sc-danger'
          : 'border-sc-border text-sc-text-secondary hover:border-sc-navy'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ── Recent sends + resend ───────────────────────────────────────────────────────
function RecentSends({
  recent,
  toast,
}: {
  recent: ReturnType<typeof god.god.notifications.recent.useQuery>
  toast: ReturnType<typeof useToast>
}) {
  const [resendTarget, setResendTarget] = useState<GodBroadcastRecent | null>(null)

  const resendM = god.god.notifications.resend.useMutation({
    onSuccess: data => {
      toast.show(`השידור נשלח שוב ל-${data.sent} נמענים`)
      setResendTarget(null)
      recent.refetch()
    },
    onError: e => {
      toast.show(e.message)
      setResendTarget(null)
    },
  })

  return (
    <>
      <Card className="mt-4">
        <CardHeader
          title="שידורים אחרונים"
          meta={<Pill kind="info">{recent.data?.length ?? 0}</Pill>}
        />
        <CardBody>
          {recent.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : recent.isError ? (
            <div className="text-center py-6 text-sc-danger text-[13px]">{recent.error?.message}</div>
          ) : !recent.data?.length ? (
            <EmptyState
              icon={<History size={28} />}
              title="אין שידורים"
              body="עדיין לא נשלחו הודעות מערכת."
            />
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>כותרת</th>
                    <th>נשלח</th>
                    <th>נמענים</th>
                    <th>נקראו</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recent.data.map((r, i) => (
                    <tr key={r.event_id ?? `orphan-${i}`}>
                      <td className="font-semibold">
                        {r.title || '—'}
                        {r.body && (
                          <div className="text-[11px] text-sc-text-muted font-normal mt-0.5 line-clamp-1">
                            {r.body}
                          </div>
                        )}
                      </td>
                      <td className="text-[12px]">{fmtTime(r.sent_at)}</td>
                      <td>{r.recipient_count}</td>
                      <td className="text-[12px] text-sc-text-secondary">{r.read_count}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<RotateCcw size={14} />}
                          onClick={() => setResendTarget(r)}
                        >
                          שלח שוב
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {resendTarget && (
        <ResendModal
          target={resendTarget}
          loading={resendM.isLoading}
          onClose={() => setResendTarget(null)}
          onConfirm={(audience, count) =>
            resendM.mutate({
              source_event_id: resendTarget.event_id,
              audience,
              title: resendTarget.title,
              body: resendTarget.body ?? undefined,
              link: resendTarget.link ?? undefined,
              expected_count: count,
              confirm: String(count),
            })
          }
        />
      )}
    </>
  )
}

// Resend re-confirms the audience (it's not stored on the rows) and previews a
// fresh count before sending again. To keep it explicit we resend to ALL users
// by default but let the operator switch to a role; one-building resend is left
// to the composer above (it needs the building picker).
function ResendModal({
  target,
  loading,
  onClose,
  onConfirm,
}: {
  target: GodBroadcastRecent
  loading: boolean
  onClose: () => void
  onConfirm: (audience: GodBroadcastAudience, count: number) => void
}) {
  const [audienceType, setAudienceType] = useState<'all' | 'role'>('all')
  const [role, setRole] = useState<'tenant' | 'provider'>('tenant')

  const audience: GodBroadcastAudience =
    audienceType === 'all' ? { type: 'all' } : { type: 'role', role }

  const preview = god.god.notifications.preview.useQuery(
    { audience },
    { keepPreviousData: true },
  )
  const count = preview.data?.count ?? 0
  const label = preview.data?.audience_label ?? ''

  return (
    <DangerConfirm
      open
      onClose={onClose}
      title="שליחה חוזרת של שידור"
      confirmText={String(count)}
      confirmLabel={`שלח שוב ל-${count} נמענים`}
      loading={loading}
      onConfirm={() => onConfirm(audience, count)}
      body={
        <div className="space-y-3">
          <p className="text-sc-danger font-semibold m-0">פעולה בעלת השפעה רחבה!</p>
          <p className="m-0">
            שליחה חוזרת של «{target.title}» כקהל יעד נבחר. בחר/י את הקהל ואשר/י.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAudienceType('all')}
              className={`flex-1 rounded-sc-input border px-3 py-1.5 text-[12px] font-semibold ${
                audienceType === 'all'
                  ? 'border-sc-danger bg-sc-danger-bg/40 text-sc-danger'
                  : 'border-sc-border text-sc-text-secondary'
              }`}
            >
              כל המשתמשים
            </button>
            <button
              type="button"
              onClick={() => setAudienceType('role')}
              className={`flex-1 rounded-sc-input border px-3 py-1.5 text-[12px] font-semibold ${
                audienceType === 'role'
                  ? 'border-sc-danger bg-sc-danger-bg/40 text-sc-danger'
                  : 'border-sc-border text-sc-text-secondary'
              }`}
            >
              לפי תפקיד
            </button>
          </div>
          {audienceType === 'role' && (
            <select
              className={inputCls}
              value={role}
              onChange={e => setRole(e.target.value as 'tenant' | 'provider')}
            >
              <option value="tenant">דיירים</option>
              <option value="provider">נותני שירות</option>
            </select>
          )}
          <div className="rounded-sc-input border border-sc-border bg-sc-surface-2 p-2 flex items-center justify-between">
            <span className="text-[12px] text-sc-text-secondary">{label}</span>
            <Pill kind={count > 0 ? 'danger' : 'neutral'}>{count} נמענים</Pill>
          </div>
          <p className="m-0 text-sc-text-secondary">
            להמשך, הקלד/י את מספר הנמענים <strong>{count}</strong> בתיבה למטה.
          </p>
        </div>
      }
    />
  )
}
