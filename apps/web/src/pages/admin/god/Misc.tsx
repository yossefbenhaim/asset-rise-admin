import { useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { DangerConfirm } from '@/components/ui/DangerConfirm'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { Users, ClipboardCheck, Star, CalendarDays, Trash2, ShieldCheck, ShieldX } from 'lucide-react'
import {
  FAMILY_INVITATION_STATUS_LABEL,
  INSPECTION_STATUSES,
  INSPECTION_STATUS_LABEL,
  INSPECTION_TYPE_LABEL,
  RATING_SOURCES,
  RATING_SOURCE_LABEL,
  CALENDAR_KINDS,
  CALENDAR_KIND_LABEL,
  type GodFamilyInvitationItem,
  type GodFamilyLinkItem,
  type GodInspectionItem,
  type GodRatingItem,
  type GodCalendarItem,
  type GodMiscCounts,
} from '@asset-rise/shared/schemas/godMisc'

// God-mode "Cross-domain Admin / Misc" page (Wave 3 — content + comms). A
// READ-FIRST cross-building console for the remaining domains, with a few
// targeted moderation writes:
//   FAMILY      — read invitations + active links; removeFamilyMember (soft,
//                 DangerConfirm)
//   INSPECTIONS — read across projects; cancelInspection (DELETE, DangerConfirm)
//   RATINGS     — read across providers; setRatingVerified (toggle, reversible)
//                 + removeRating (DELETE, DangerConfirm)
//   CALENDAR    — read-only across buildings
//
// The god.misc router is an isolated sibling that the integration step merges
// into the god router; until that lands its procedures aren't on the typed tRPC
// client, so this page reaches them through a thin typed accessor. All call
// sites stay strongly typed against the shared schema interfaces.
type ListQuery<TInput, TItem> = {
  useQuery: (
    input: TInput,
    opts?: { keepPreviousData?: boolean },
  ) => {
    data?: TItem[]
    isLoading: boolean
    isError: boolean
    error: { message: string } | null
  }
  invalidate: () => Promise<void>
}
type MutOpts = { onSuccess?: () => void; onError?: (e: { message: string }) => void }
type Mut<TInput> = { mutate: (input: TInput) => void; isLoading: boolean }

const god = trpc as unknown as {
  god: {
    misc: {
      counts: {
        useQuery: (i?: unknown) => { data?: GodMiscCounts }
        invalidate: () => Promise<void>
      }
      familyInvitations: ListQuery<
        { q?: string; status?: string; limit?: number },
        GodFamilyInvitationItem
      >
      familyLinks: ListQuery<
        { q?: string; include_removed?: boolean; limit?: number },
        GodFamilyLinkItem
      >
      removeFamilyMember: { useMutation: (o: MutOpts) => Mut<{ id: string; confirm: string }> }
      inspections: ListQuery<
        { q?: string; status?: string; project_id?: string; limit?: number },
        GodInspectionItem
      >
      cancelInspection: { useMutation: (o: MutOpts) => Mut<{ id: string; confirm: string }> }
      ratings: ListQuery<
        { q?: string; source?: string; provider_id?: string; verified?: boolean; limit?: number },
        GodRatingItem
      >
      setRatingVerified: {
        useMutation: (o: MutOpts) => Mut<{ id: string; verified: boolean }>
      }
      removeRating: { useMutation: (o: MutOpts) => Mut<{ id: string; confirm: string }> }
      calendarEvents: ListQuery<
        { q?: string; kind?: string; building_id?: string; limit?: number },
        GodCalendarItem
      >
    }
  }
}

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[13px]'

type Tab = 'family' | 'inspections' | 'ratings' | 'calendar'

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('he-IL')
}
function label(map: Record<string, string>, k: string | null | undefined): string {
  if (!k) return '—'
  return map[k] ?? k
}

export default function GodMisc() {
  const [tab, setTab] = useState<Tab>('family')
  const counts = god.god.misc.counts.useQuery()

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'family', label: 'משפחה', icon: <Users size={15} />, count: counts.data?.family_links_active },
    { key: 'inspections', label: 'בדיקות', icon: <ClipboardCheck size={15} />, count: counts.data?.inspections },
    { key: 'ratings', label: 'דירוגים', icon: <Star size={15} />, count: counts.data?.ratings },
    { key: 'calendar', label: 'יומן', icon: <CalendarDays size={15} />, count: counts.data?.calendar_events },
  ]

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>ניהול חוצה-תחומים — מנהל-על</h1>
      </div>

      <ControlPanel
        title="שליטה חוצת-תחומים"
        description="צפייה בכלל המערכת בתחומי משפחה, בדיקות, דירוגים ויומן — לצד פעולות מתינות נקודתיות (הסרת בן/בת משפחה, ביטול בדיקה, אימות/הסרת דירוג). כל פעולה נרשמת ביומן הביקורת; פעולות הרסניות מאחורי אישור הקלדה."
        tone="navy"
      >
        <div className="flex flex-wrap gap-2">
          {tabs.map(t => (
            <Button
              key={t.key}
              size="sm"
              variant={tab === t.key ? 'primary' : 'ghost'}
              icon={t.icon}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {typeof t.count === 'number' && (
                <span className="mr-1 opacity-70">({t.count})</span>
              )}
            </Button>
          ))}
        </div>
      </ControlPanel>

      <div className="mt-4">
        {tab === 'family' && <FamilyTab />}
        {tab === 'inspections' && <InspectionsTab />}
        {tab === 'ratings' && <RatingsTab />}
        {tab === 'calendar' && <CalendarTab />}
      </div>
    </div>
  )
}

// ── FAMILY ───────────────────────────────────────────────────────────────────
function FamilyTab() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [includeRemoved, setIncludeRemoved] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<GodFamilyLinkItem | null>(null)

  const links = god.god.misc.familyLinks.useQuery(
    { q: q.trim() || undefined, include_removed: includeRemoved, limit: 200 },
    { keepPreviousData: true },
  )
  const invites = god.god.misc.familyInvitations.useQuery(
    { q: q.trim() || undefined, limit: 200 },
    { keepPreviousData: true },
  )

  const removeM = god.god.misc.removeFamilyMember.useMutation({
    onSuccess: () => {
      toast.show('בן/בת המשפחה הוסר/ה')
      setRemoveTarget(null)
      void god.god.misc.familyLinks.invalidate()
      void god.god.misc.counts.invalidate()
    },
    onError: e => toast.show(e.message),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <input
          className={inputCls}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="חיפוש לפי שם / אימייל…"
        />
        <label className="flex items-center gap-2 text-[12px] text-sc-text-secondary whitespace-nowrap">
          <input
            type="checkbox"
            checked={includeRemoved}
            onChange={e => setIncludeRemoved(e.target.checked)}
          />
          כלול קישורים שהוסרו
        </label>
      </div>

      <Card>
        <CardHeader title="קישורים משפחתיים פעילים" meta={<Pill kind="info">{links.data?.length ?? 0}</Pill>} />
        <CardBody>
          {links.isLoading ? (
            <Loading />
          ) : links.isError ? (
            <ErrText msg={links.error?.message} />
          ) : !links.data?.length ? (
            <EmptyState icon={<Users size={28} />} title="אין קישורים" body="לא נמצאו קישורים משפחתיים." />
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>חשבון ראשי</th>
                    <th>בן/בת משפחה</th>
                    <th>נוצר</th>
                    <th>סטטוס</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {links.data.map(l => (
                    <tr key={l.id}>
                      <td className="text-[12px]">
                        {l.primary_name ?? '—'}
                        {l.primary_email && <div className="text-sc-text-muted">{l.primary_email}</div>}
                      </td>
                      <td className="text-[12px] font-semibold">
                        {l.member_name ?? l.member_display_name ?? '—'}
                        {l.member_email && <div className="text-sc-text-muted font-normal">{l.member_email}</div>}
                      </td>
                      <td className="text-[12px]">{fmtDate(l.created_at)}</td>
                      <td>
                        {l.removed_at ? (
                          <Pill kind="neutral">הוסר</Pill>
                        ) : (
                          <Pill kind="success">פעיל</Pill>
                        )}
                      </td>
                      <td>
                        {!l.removed_at && (
                          <Button
                            size="sm"
                            variant="danger"
                            icon={<Trash2 size={14} />}
                            onClick={() => setRemoveTarget(l)}
                          >
                            הסר
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="הזמנות משפחתיות" meta={<Pill kind="info">{invites.data?.length ?? 0}</Pill>} />
        <CardBody>
          {invites.isLoading ? (
            <Loading />
          ) : invites.isError ? (
            <ErrText msg={invites.error?.message} />
          ) : !invites.data?.length ? (
            <EmptyState icon={<Users size={28} />} title="אין הזמנות" body="לא נמצאו הזמנות משפחתיות." />
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>מזמין/ה</th>
                    <th>מוזמן/ת</th>
                    <th>סטטוס</th>
                    <th>נוצרה</th>
                    <th>תוקף</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.data.map(iv => (
                    <tr key={iv.id}>
                      <td className="text-[12px]">
                        {iv.primary_name ?? '—'}
                        {iv.primary_email && <div className="text-sc-text-muted">{iv.primary_email}</div>}
                      </td>
                      <td className="text-[12px]">
                        {iv.invitee_name ?? '—'}
                        {iv.invitee_email && <div className="text-sc-text-muted">{iv.invitee_email}</div>}
                      </td>
                      <td>
                        <Pill kind={iv.status === 'accepted' ? 'success' : iv.status === 'cancelled' || iv.status === 'expired' ? 'neutral' : 'gold'}>
                          {label(FAMILY_INVITATION_STATUS_LABEL as Record<string, string>, iv.status)}
                        </Pill>
                      </td>
                      <td className="text-[12px]">{fmtDate(iv.created_at)}</td>
                      <td className="text-[12px]">{fmtDate(iv.expires_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <DangerConfirm
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="הסרת בן/בת משפחה"
        confirmText={
          removeTarget?.member_name ||
          removeTarget?.member_display_name ||
          removeTarget?.member_email ||
          'בן משפחה'
        }
        confirmLabel="הסר קישור"
        loading={removeM.isLoading}
        onConfirm={() =>
          removeTarget &&
          removeM.mutate({
            id: removeTarget.id,
            confirm:
              removeTarget.member_name ||
              removeTarget.member_display_name ||
              removeTarget.member_email ||
              'בן משפחה',
          })
        }
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0">פעולה הרסנית!</p>
            <p className="m-0">
              הסרת הקישור תנתק את בן/בת המשפחה מהחשבון הראשי ותשלול את הגישה היורשת לבניין. הפעולה רכה (removed_at) ונרשמת ביומן הביקורת.
            </p>
          </div>
        }
      />
    </div>
  )
}

// ── INSPECTIONS ────────────────────────────────────────────────────────────────
function InspectionsTab() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [cancelTarget, setCancelTarget] = useState<GodInspectionItem | null>(null)

  const list = god.god.misc.inspections.useQuery(
    { q: q.trim() || undefined, status: status || undefined, limit: 200 },
    { keepPreviousData: true },
  )

  const cancelM = god.god.misc.cancelInspection.useMutation({
    onSuccess: () => {
      toast.show('הבדיקה בוטלה')
      setCancelTarget(null)
      void god.god.misc.inspections.invalidate()
      void god.god.misc.counts.invalidate()
    },
    onError: e => toast.show(e.message),
  })

  const token = (i: GodInspectionItem) => i.title || i.project_name || i.id

  return (
    <Card>
      <CardHeader
        title="בדיקות ספקים"
        meta={<Pill kind="info">{list.data?.length ?? 0}</Pill>}
      />
      <CardBody>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            className={inputCls}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="חיפוש לפי פרויקט / ספק / כותרת…"
          />
          <select className={`${inputCls} sm:w-48`} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            {INSPECTION_STATUSES.map(s => (
              <option key={s} value={s}>{INSPECTION_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>

        {list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrText msg={list.error?.message} />
        ) : !list.data?.length ? (
          <EmptyState icon={<ClipboardCheck size={28} />} title="אין בדיקות" body="לא נמצאו בדיקות התואמות את הסינון." />
        ) : (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>פרויקט</th>
                  <th>ספק</th>
                  <th>סוג</th>
                  <th>כותרת</th>
                  <th>ציון</th>
                  <th>סטטוס</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.data.map(i => (
                  <tr key={i.id}>
                    <td className="text-[12px] font-semibold">
                      {i.project_name ?? '—'}
                      {i.building_address && <div className="text-sc-text-muted font-normal">{i.building_address}</div>}
                    </td>
                    <td className="text-[12px]">{i.provider_name ?? '—'}</td>
                    <td><Pill kind="gold">{label(INSPECTION_TYPE_LABEL, i.inspection_type)}</Pill></td>
                    <td className="text-[12px]">{i.title ?? '—'}</td>
                    <td>{i.score ?? '—'}</td>
                    <td>
                      <Pill kind={i.status === 'submitted' ? 'success' : i.status === 'revised' ? 'gold' : 'neutral'}>
                        {label(INSPECTION_STATUS_LABEL as Record<string, string>, i.status)}
                      </Pill>
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<Trash2 size={14} />}
                        onClick={() => setCancelTarget(i)}
                      >
                        בטל
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>

      <DangerConfirm
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="ביטול בדיקה"
        confirmText={cancelTarget ? token(cancelTarget) : ''}
        confirmLabel="בטל בדיקה"
        loading={cancelM.isLoading}
        onConfirm={() =>
          cancelTarget && cancelM.mutate({ id: cancelTarget.id, confirm: token(cancelTarget) })
        }
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0">פעולה הרסנית!</p>
            <p className="m-0">
              ביטול הבדיקה ימחק את רשומת הבדיקה ואת הקבצים המצורפים לה לצמיתות (אין סטטוס «מבוטל» — המחיקה סופית). הפעולה נרשמת ביומן הביקורת.
            </p>
          </div>
        }
      />
    </Card>
  )
}

// ── RATINGS ──────────────────────────────────────────────────────────────────
function RatingsTab() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [source, setSource] = useState('')
  const [removeTarget, setRemoveTarget] = useState<GodRatingItem | null>(null)

  const list = god.god.misc.ratings.useQuery(
    { q: q.trim() || undefined, source: source || undefined, limit: 200 },
    { keepPreviousData: true },
  )

  function refresh() {
    void god.god.misc.ratings.invalidate()
    void god.god.misc.counts.invalidate()
  }

  const verifyM = god.god.misc.setRatingVerified.useMutation({
    onSuccess: () => { toast.show('סטטוס האימות עודכן'); refresh() },
    onError: e => toast.show(e.message),
  })
  const removeM = god.god.misc.removeRating.useMutation({
    onSuccess: () => { toast.show('הדירוג הוסר'); setRemoveTarget(null); refresh() },
    onError: e => toast.show(e.message),
  })

  const token = (r: GodRatingItem) => r.provider_name || r.submitter_name || r.id

  return (
    <Card>
      <CardHeader title="דירוגי ספקים" meta={<Pill kind="info">{list.data?.length ?? 0}</Pill>} />
      <CardBody>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            className={inputCls}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="חיפוש לפי ספק / מדרג / טקסט…"
          />
          <select className={`${inputCls} sm:w-48`} value={source} onChange={e => setSource(e.target.value)}>
            <option value="">כל המקורות</option>
            {RATING_SOURCES.map(s => (
              <option key={s} value={s}>{RATING_SOURCE_LABEL[s]}</option>
            ))}
          </select>
        </div>

        {list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrText msg={list.error?.message} />
        ) : !list.data?.length ? (
          <EmptyState icon={<Star size={28} />} title="אין דירוגים" body="לא נמצאו דירוגים התואמים את הסינון." />
        ) : (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>ספק</th>
                  <th>מקור</th>
                  <th>דירוג</th>
                  <th>ביקורת</th>
                  <th>אימות</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.data.map(r => (
                  <tr key={r.id}>
                    <td className="text-[12px] font-semibold">
                      {r.provider_name ?? '—'}
                      {r.submitter_name && <div className="text-sc-text-muted font-normal">מדרג: {r.submitter_name}</div>}
                    </td>
                    <td><Pill kind="neutral">{label(RATING_SOURCE_LABEL as Record<string, string>, r.source)}</Pill></td>
                    <td className="font-semibold">{r.rating ?? '—'}{r.rating !== null ? ' ★' : ''}</td>
                    <td className="text-[12px] max-w-[260px] truncate" title={r.review_text ?? ''}>
                      {r.review_text ?? '—'}
                    </td>
                    <td>
                      {r.verified ? <Pill kind="success">מאומת</Pill> : <Pill kind="neutral">לא מאומת</Pill>}
                    </td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={r.verified ? <ShieldX size={14} /> : <ShieldCheck size={14} />}
                          loading={verifyM.isLoading}
                          onClick={() => verifyM.mutate({ id: r.id, verified: !r.verified })}
                        >
                          {r.verified ? 'בטל אימות' : 'אמת'}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          icon={<Trash2 size={14} />}
                          onClick={() => setRemoveTarget(r)}
                        >
                          הסר
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>

      <DangerConfirm
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="הסרת דירוג"
        confirmText={removeTarget ? token(removeTarget) : ''}
        confirmLabel="הסר דירוג"
        loading={removeM.isLoading}
        onConfirm={() =>
          removeTarget && removeM.mutate({ id: removeTarget.id, confirm: token(removeTarget) })
        }
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0">פעולה הרסנית!</p>
            <p className="m-0">
              הסרת הדירוג תמחק את הרשומה לצמיתות והממוצע הציבורי של הספק יחושב מחדש. אם ברצונך רק להסתיר דירוג זמנית — השתמש/י ב«בטל אימות». הפעולה נרשמת ביומן הביקורת.
            </p>
          </div>
        }
      />
    </Card>
  )
}

// ── CALENDAR (read-only) ────────────────────────────────────────────────────────
function CalendarTab() {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')

  const list = god.god.misc.calendarEvents.useQuery(
    { q: q.trim() || undefined, kind: kind || undefined, limit: 200 },
    { keepPreviousData: true },
  )

  return (
    <Card>
      <CardHeader title="אירועי יומן ופגישות" meta={<Pill kind="info">{list.data?.length ?? 0}</Pill>} />
      <CardBody>
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            className={inputCls}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="חיפוש לפי כותרת / בניין / יוצר…"
          />
          <select className={`${inputCls} sm:w-48`} value={kind} onChange={e => setKind(e.target.value)}>
            <option value="">כל הסוגים</option>
            {CALENDAR_KINDS.map(k => (
              <option key={k} value={k}>{CALENDAR_KIND_LABEL[k]}</option>
            ))}
          </select>
        </div>

        {list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrText msg={list.error?.message} />
        ) : !list.data?.length ? (
          <EmptyState icon={<CalendarDays size={28} />} title="אין אירועים" body="לא נמצאו אירועי יומן התואמים את הסינון." />
        ) : (
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>כותרת</th>
                  <th>סוג</th>
                  <th>בניין</th>
                  <th>יוצר</th>
                  <th>מתחיל</th>
                  <th>מיקום</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map(e => (
                  <tr key={e.id}>
                    <td className="text-[12px] font-semibold">{e.title ?? '—'}</td>
                    <td><Pill kind="neutral">{label(CALENDAR_KIND_LABEL as Record<string, string>, e.kind)}</Pill></td>
                    <td className="text-[12px]">
                      {e.building_address ?? '—'}
                      {e.project_name && <div className="text-sc-text-muted">{e.project_name}</div>}
                    </td>
                    <td className="text-[12px]">{e.creator_name ?? '—'}</td>
                    <td className="text-[12px]">{fmtDate(e.starts_at)}</td>
                    <td className="text-[12px]">{e.location ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

// ── shared bits ───────────────────────────────────────────────────────────────
function Loading() {
  return <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
}
function ErrText({ msg }: { msg?: string }) {
  return <div className="text-center py-6 text-sc-danger text-[13px]">{msg ?? 'שגיאה'}</div>
}
