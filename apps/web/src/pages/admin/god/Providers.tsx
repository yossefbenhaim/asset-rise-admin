import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { trpc } from '@/lib/api/trpc'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DataTable } from '@/components/ui/DataTable'
import { useToast } from '@/components/ui/Toast'
import { Star, Ban } from 'lucide-react'
import {
  PROVIDER_TYPES,
  PROVIDER_TYPE_LABEL,
  type GodProviderType,
  type GodProviderListItem,
  type GodProviderDetail,
} from '@asset-rise/shared'

type ProviderRow = GodProviderListItem & Record<string, unknown>

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

function Rating({ avg, count }: { avg: number | null; count: number | null }) {
  if (avg == null || !count) return null
  return (
    <Pill kind="gold">
      <Star size={11} /> {avg.toFixed(1)} ({count})
    </Pill>
  )
}

const columns: ColumnDef<ProviderRow, unknown>[] = [
  {
    id: 'full_name',
    header: 'שם',
    accessorFn: r => r.full_name ?? '',
    cell: ({ row }) => (
      <span className="font-semibold text-sc-text">{row.original.full_name || '(ללא שם)'}</span>
    ),
  },
  {
    id: 'provider_type',
    header: 'סוג',
    accessorFn: r => typeLabel(r.provider_type),
    cell: ({ row }) => <Pill kind="navy">{typeLabel(row.original.provider_type)}</Pill>,
  },
  {
    id: 'email',
    header: 'אימייל',
    accessorFn: r => r.email ?? '',
    cell: ({ row }) =>
      row.original.email ? (
        <span className="text-sc-text-secondary" dir="ltr">{row.original.email}</span>
      ) : (
        <span className="text-sc-text-muted">—</span>
      ),
  },
  {
    id: 'phone',
    header: 'טלפון',
    accessorFn: r => r.phone ?? '',
    cell: ({ row }) =>
      row.original.phone ? (
        <span className="text-sc-text-secondary sc-num" dir="ltr">{row.original.phone}</span>
      ) : (
        <span className="text-sc-text-muted">—</span>
      ),
  },
  {
    id: 'city',
    header: 'עיר',
    accessorFn: r => r.city ?? '',
    cell: ({ row }) =>
      row.original.city ? (
        <span className="text-sc-text-secondary">{row.original.city}</span>
      ) : (
        <span className="text-sc-text-muted">—</span>
      ),
  },
  {
    id: 'completed_projects',
    header: 'פרויקטים',
    accessorFn: r => r.completed_projects ?? -1,
    cell: ({ row }) =>
      row.original.completed_projects != null ? (
        <span className="text-sc-text-secondary sc-num">{row.original.completed_projects}</span>
      ) : (
        <span className="text-sc-text-muted">—</span>
      ),
  },
  {
    id: 'rating',
    header: 'דירוג',
    accessorFn: r => r.rating_avg ?? -1,
    cell: ({ row }) => {
      const { rating_avg, rating_count } = row.original
      if (rating_avg == null || !rating_count) return <span className="text-sc-text-muted">—</span>
      return <Rating avg={rating_avg} count={rating_count} />
    },
  },
]

// God-mode Providers. List/search providers, drill into one, and run the
// audited god writes (edit common profile / reversible ban). Per-type license
// and specializations are shown read-only for Wave 1.
export default function GodProviders() {
  const [providerType, setProviderType] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const list = trpc.god.providers.list.useQuery(
    {
      provider_type: (providerType || undefined) as GodProviderType | undefined,
      limit: 200,
    },
    { keepPreviousData: true },
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>ספקים</h1>
      </div>

      <DataTable<ProviderRow>
        columns={columns}
        data={(list.data ?? []) as ProviderRow[]}
        loading={list.isLoading}
        onRowClick={r => setActiveId(r.id)}
        csvName="providers"
        searchPlaceholder="חיפוש ספק…"
        emptyTitle="אין ספקים"
        emptyBody="לא נמצאו ספקים התואמים את הסינון."
        toolbar={
          <select
            className="bg-sc-bg border border-sc-border rounded-sc-input py-2 px-3 text-[13px] text-sc-text outline-none focus:border-sc-primary transition-colors max-w-[12rem]"
            value={providerType}
            onChange={e => setProviderType(e.target.value)}
          >
            <option value="">כל הסוגים</option>
            {PROVIDER_TYPES.map(t => (
              <option key={t} value={t}>{PROVIDER_TYPE_LABEL[t]}</option>
            ))}
          </select>
        }
      />

      {activeId && (
        <ProviderDetail id={activeId} onClose={() => setActiveId(null)} />
      )}
    </div>
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
