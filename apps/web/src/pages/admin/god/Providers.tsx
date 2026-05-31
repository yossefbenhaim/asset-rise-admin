import { useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { Briefcase, Star, Ban } from 'lucide-react'
import {
  PROVIDER_TYPES,
  PROVIDER_TYPE_LABEL,
  type GodProviderType,
  type GodProviderListItem,
  type GodProviderDetail,
} from '@asset-rise/shared'

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[14px]'
const labelCls = 'text-sc-text-secondary mb-1 text-[12px]'

function typeLabel(t: string | null | undefined): string {
  if (!t) return '—'
  return PROVIDER_TYPE_LABEL[t as GodProviderType] ?? t
}

// Friendly Hebrew labels for the common per-type fields we surface read-only.
// Unmapped keys are shown with their raw column name.
const TYPE_FIELD_LABEL: Record<string, string> = {
  license_number: 'מספר רישיון',
  license_authority: 'רשות הרישוי',
  license_expiry: 'תוקף רישיון',
  operating_regions: 'אזורי פעילות',
  experience_years: 'שנות ניסיון',
  completed_projects: 'פרויקטים שהושלמו',
  specializations: 'התמחויות',
  specialization_types: 'סוגי התמחות',
  trades: 'תחומי עבודה',
  service_areas: 'אזורי שירות',
  preservation_certified: 'הסמכת שימור',
  supports_rights_transfer: 'תומך בהעברת זכויות',
  office_name: 'שם משרד',
  city: 'עיר',
  neighborhoods: 'שכונות',
  years_of_experience: 'שנות ניסיון',
  preferred_project_sizes: 'גודל פרויקט מועדף',
  preferred_complexity: 'מורכבות מועדפת',
  completed_projects_count: 'פרויקטים שהושלמו',
  in_progress_projects_count: 'פרויקטים בתהליך',
  why_choose_me: 'למה לבחור בי',
  fee_structure: 'מבנה שכר טרחה',
  fee_percent: 'אחוז שכר טרחה',
  default_profit_target_pct: 'יעד רווח (%)',
  default_risk_tolerance: 'סובלנות סיכון',
  preferred_complex_type: 'סוג מתחם מועדף',
  preferred_project_types: 'סוגי פרויקט מועדפים',
  bonding_amount: 'סכום ערבות',
  insurance_cert_url: 'אישור ביטוח',
}

// Keys we never render in the read-only per-type section (ids/timestamps/urls).
const TYPE_FIELD_SKIP = new Set([
  'id',
  'created_at',
  'updated_at',
  'license_pdf_url',
  'sample_documents_urls',
  'portfolio_urls',
  'references',
])

// God-mode Providers. List/search providers, drill into one, and run the
// audited god writes (edit common profile / reversible ban). Per-type license
// and specializations are shown read-only for Wave 1.
export default function GodProviders() {
  const [q, setQ] = useState('')
  const [providerType, setProviderType] = useState('')
  const [city, setCity] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const list = trpc.god.providers.list.useQuery(
    {
      q: q.trim() || undefined,
      provider_type: (providerType || undefined) as GodProviderType | undefined,
      city: city.trim() || undefined,
      limit: 200,
    },
    { keepPreviousData: true },
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>ספקים</h1>
      </div>

      <ControlPanel
        title="ניהול ספקים — מנהל-על"
        description="עריכת פרופיל ספק (שם, טלפון, אודות, פרויקטים שהושלמו) והשבתה זמנית. רישיון והתמחויות מוצגים לקריאה בלבד. כל פעולה נרשמת ביומן הביקורת."
        tone="danger"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className={inputCls}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="חיפוש לפי שם / אימייל / טלפון…"
          />
          <select
            className={`${inputCls} sm:w-48`}
            value={providerType}
            onChange={e => setProviderType(e.target.value)}
          >
            <option value="">כל הסוגים</option>
            {PROVIDER_TYPES.map(t => (
              <option key={t} value={t}>{PROVIDER_TYPE_LABEL[t]}</option>
            ))}
          </select>
          <input
            className={`${inputCls} sm:w-44`}
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="עיר…"
          />
        </div>
      </ControlPanel>

      <Card className="mt-4">
        <CardHeader
          title="ספקים"
          meta={<Pill kind="info">{list.data?.length ?? 0}</Pill>}
        />
        <CardBody>
          {list.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : list.isError ? (
            <div className="text-center py-6 text-sc-danger text-[13px]">{list.error.message}</div>
          ) : !list.data?.length ? (
            <EmptyState icon={<Briefcase size={28} />} title="אין ספקים" body="לא נמצאו ספקים התואמים את הסינון." />
          ) : (
            <div className="space-y-2">
              {list.data.map(p => (
                <ProviderRow key={p.id} p={p} onOpen={() => setActiveId(p.id)} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {activeId && (
        <ProviderDetail id={activeId} onClose={() => setActiveId(null)} />
      )}
    </div>
  )
}

function Rating({ avg, count }: { avg: number | null; count: number | null }) {
  if (avg == null || !count) return null
  return (
    <Pill kind="gold">
      <Star size={11} /> {avg.toFixed(1)} ({count})
    </Pill>
  )
}

function ProviderRow({ p, onOpen }: { p: GodProviderListItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-right p-3 rounded-sc-input border border-sc-border bg-white hover:bg-sc-bg/60 transition-colors"
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="font-semibold text-[14px]">{p.full_name || '(ללא שם)'}</div>
        <Pill kind="navy">{typeLabel(p.provider_type)}</Pill>
        {p.phone && <div className="text-[12px] text-sc-text-secondary">{p.phone}</div>}
        <div className="flex-1" />
        <Rating avg={p.rating_avg} count={p.rating_count} />
      </div>
      <div className="text-[11px] text-sc-text-muted mt-1 flex flex-wrap gap-2">
        {p.email && <span>{p.email}</span>}
        {p.city && <span>· {p.city}</span>}
        {p.completed_projects != null && <span>· {p.completed_projects} פרויקטים</span>}
      </div>
    </button>
  )
}

function ProviderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useContext()
  const detail = trpc.god.providers.get.useQuery({ id })

  const invalidate = () => {
    void utils.god.providers.list.invalidate()
    void utils.god.providers.get.invalidate({ id })
  }

  if (detail.isLoading) {
    return (
      <Modal open onClose={onClose} title="פרטי ספק">
        <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
      </Modal>
    )
  }
  if (detail.isError || !detail.data) {
    return (
      <Modal open onClose={onClose} title="פרטי ספק">
        <div className="text-center py-6 text-sc-danger text-[13px]">{detail.error?.message ?? 'ספק לא נמצא'}</div>
      </Modal>
    )
  }

  return (
    <ProviderDetailBody
      p={detail.data}
      onClose={onClose}
      onChanged={invalidate}
      toast={toast}
    />
  )
}

type Toast = ReturnType<typeof useToast>

function ProviderDetailBody({
  p, onClose, onChanged, toast,
}: {
  p: GodProviderDetail
  onClose: () => void
  onChanged: () => void
  toast: Toast
}) {
  const pp = (p.provider_profile ?? {}) as Record<string, unknown>

  // ── edit profile form state ──
  const [fullName, setFullName] = useState(p.full_name ?? '')
  const [phone, setPhone] = useState(p.phone ?? '')
  const [about, setAbout] = useState(pp.about != null ? String(pp.about) : '')
  const [completed, setCompleted] = useState(
    pp.completed_projects != null ? String(pp.completed_projects) : '',
  )

  const editM = trpc.god.providers.editProviderProfile.useMutation({
    onSuccess: () => { toast.show('פרופיל הספק עודכן'); onChanged() },
    onError: e => toast.show(e.message),
  })
  const banM = trpc.god.providers.setBanned.useMutation({
    onSuccess: () => { toast.show('סטטוס ההשבתה עודכן'); onChanged() },
    onError: e => toast.show(e.message),
  })

  const completedNum = completed.trim() === '' ? null : Number(completed)
  const completedInvalid =
    completedNum !== null &&
    (Number.isNaN(completedNum) || completedNum < 0 || !Number.isInteger(completedNum))

  return (
    <Modal
      open
      onClose={onClose}
      title={`ספק: ${p.full_name || p.email || p.id}`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>סגור</Button>
        </div>
      }
    >
      <div className="space-y-5 text-[13px]">
        {/* Identity summary */}
        <div className="space-y-1">
          <Row label="אימייל" value={p.email || '—'} />
          <Row label="סוג ספק" value={<Pill kind="navy">{typeLabel(p.provider_type)}</Pill>} />
          <Row
            label="סטטוס"
            value={
              p.banned ? <Pill kind="danger">מושבת</Pill> : <Pill kind="success">פעיל</Pill>
            }
          />
        </div>

        {/* Edit common profile */}
        <Section title="עריכת פרופיל">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className={labelCls}>שם מלא</div>
              <input className={inputCls} value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>
            <div>
              <div className={labelCls}>טלפון</div>
              <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div>
              <div className={labelCls}>פרויקטים שהושלמו</div>
              <input
                className={inputCls}
                value={completed}
                onChange={e => setCompleted(e.target.value)}
                inputMode="numeric"
                placeholder="לדוגמה 12"
              />
              {completedInvalid && (
                <div className="text-sc-danger text-[11px] mt-1">חייב להיות מספר שלם אי-שלילי</div>
              )}
            </div>
          </div>
          <div className="mt-3">
            <div className={labelCls}>אודות</div>
            <textarea
              className={`${inputCls} min-h-[88px] resize-y`}
              value={about}
              onChange={e => setAbout(e.target.value)}
              placeholder="תיאור הספק…"
            />
          </div>
          <div className="flex justify-end mt-3">
            <Button
              size="sm"
              loading={editM.isLoading}
              disabled={completedInvalid}
              onClick={() =>
                editM.mutate({
                  id: p.id,
                  full_name: fullName,
                  phone: phone.trim() === '' ? null : phone,
                  about: about.trim() === '' ? null : about,
                  completed_projects: completedNum,
                })
              }
            >שמור פרופיל</Button>
          </div>
        </Section>

        {/* Per-type license / specializations — read-only for Wave 1 */}
        <TypeProfileSection p={p} />

        {/* Danger zone — reversible ban only (no hard delete in Wave 1) */}
        <Section title="אזור מסוכן" danger>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sc-text-secondary">
              {p.banned
                ? 'הספק מושבת — לא יכול להתחבר. ניתן לבטל בכל עת.'
                : 'השבתה זמנית מונעת התחברות. פעולה הפיכה.'}
            </div>
            <Button
              size="sm"
              variant={p.banned ? 'secondary' : 'danger'}
              icon={<Ban size={14} />}
              loading={banM.isLoading}
              onClick={() => banM.mutate({ id: p.id, banned: !p.banned })}
            >{p.banned ? 'בטל השבתה' : 'השבת'}</Button>
          </div>
        </Section>
      </div>
    </Modal>
  )
}

// Read-only render of the per-type license/specialization row. coordinator/
// generic providers have no per-type table → a friendly empty note.
function TypeProfileSection({ p }: { p: GodProviderDetail }) {
  if (!p.type_table) {
    return (
      <Section title="רישיון והתמחויות">
        <div className="text-sc-text-secondary">לסוג ספק זה אין טבלת רישיון ייעודית.</div>
      </Section>
    )
  }
  const tp = (p.type_profile ?? {}) as Record<string, unknown>
  const entries = Object.entries(tp).filter(
    ([k, v]) => !TYPE_FIELD_SKIP.has(k) && v != null && !(Array.isArray(v) && v.length === 0) && v !== '',
  )

  return (
    <Section title="רישיון והתמחויות">
      {!p.type_profile ? (
        <div className="text-sc-text-secondary">הספק טרם מילא פרטי רישיון/התמחות.</div>
      ) : !entries.length ? (
        <div className="text-sc-text-secondary">אין פרטים להצגה.</div>
      ) : (
        <div className="space-y-1">
          {entries.map(([k, v]) => (
            <Row key={k} label={TYPE_FIELD_LABEL[k] ?? k} value={renderValue(v)} />
          ))}
        </div>
      )}
    </Section>
  )
}

function renderValue(v: unknown): React.ReactNode {
  if (Array.isArray(v)) return v.map(String).join(', ')
  if (typeof v === 'boolean') return v ? 'כן' : 'לא'
  if (v && typeof v === 'object') return JSON.stringify(v)
  return String(v)
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
