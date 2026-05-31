import { useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DangerConfirm } from '@/components/ui/DangerConfirm'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { Users, Crown, ShieldCheck, Flag, Ban, Trash2 } from 'lucide-react'
import type { GodTenantListItem, GodTenantDetail } from '@asset-rise/shared'

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[14px]'
const labelCls = 'text-sc-text-secondary mb-1 text-[12px]'

// God-mode Tenants + Vaad. List/search tenants, drill into one, and run the
// audited god writes (edit profile / set vaad / move building / ban / delete).
export default function GodTenants() {
  const [q, setQ] = useState('')
  const [buildingId, setBuildingId] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const buildings = trpc.god.tenants.buildingOptions.useQuery(undefined, {
    staleTime: 60_000,
  })
  const list = trpc.god.tenants.list.useQuery(
    {
      q: q.trim() || undefined,
      building_id: buildingId || undefined,
      limit: 200,
    },
    { keepPreviousData: true },
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>דיירים וועד</h1>
      </div>

      <ControlPanel
        title="ניהול דיירים וועד — מנהל-על"
        description="עריכת פרופיל דייר, שינוי הרכב הוועד, העברת בניין, השבתה זמנית ומחיקה לצמיתות. כל פעולה נרשמת ביומן הביקורת."
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
            className={`${inputCls} sm:w-72`}
            value={buildingId}
            onChange={e => setBuildingId(e.target.value)}
          >
            <option value="">כל הבניינים</option>
            {(buildings.data ?? []).map(b => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </div>
      </ControlPanel>

      <Card className="mt-4">
        <CardHeader
          title="דיירים"
          meta={<Pill kind="info">{list.data?.length ?? 0}</Pill>}
        />
        <CardBody>
          {list.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : list.isError ? (
            <div className="text-center py-6 text-sc-danger text-[13px]">{list.error.message}</div>
          ) : !list.data?.length ? (
            <EmptyState icon={<Users size={28} />} title="אין דיירים" body="לא נמצאו דיירים התואמים את הסינון." />
          ) : (
            <div className="space-y-2">
              {list.data.map(t => (
                <TenantRow key={t.id} t={t} onOpen={() => setActiveId(t.id)} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {activeId && (
        <TenantDetail id={activeId} onClose={() => setActiveId(null)} />
      )}
    </div>
  )
}

function VaadPills({ t }: { t: Pick<GodTenantListItem, 'is_committee_chair' | 'is_committee_member' | 'is_organizer'> }) {
  return (
    <>
      {t.is_committee_chair && <Pill kind="gold"><Crown size={11} /> יו"ר ועד</Pill>}
      {t.is_committee_member && <Pill kind="navy"><ShieldCheck size={11} /> חבר ועד</Pill>}
      {t.is_organizer && <Pill kind="info"><Flag size={11} /> מארגן</Pill>}
    </>
  )
}

function TenantRow({ t, onOpen }: { t: GodTenantListItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-right p-3 rounded-sc-input border border-sc-border bg-white hover:bg-sc-bg/60 transition-colors"
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <div className="font-semibold text-[14px]">{t.full_name || '(ללא שם)'}</div>
        {t.phone && <div className="text-[12px] text-sc-text-secondary">{t.phone}</div>}
        <div className="flex-1" />
        <VaadPills t={t} />
      </div>
      <div className="text-[11px] text-sc-text-muted mt-1 flex flex-wrap gap-2">
        {t.email && <span>{t.email}</span>}
        {t.building_label && <span>· {t.building_label}</span>}
        {t.apartment_number && <span>· דירה {t.apartment_number}</span>}
      </div>
    </button>
  )
}

function TenantDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useContext()
  const detail = trpc.god.tenants.get.useQuery({ id })
  const buildings = trpc.god.tenants.buildingOptions.useQuery(undefined, { staleTime: 60_000 })

  const invalidate = () => {
    void utils.god.tenants.list.invalidate()
    void utils.god.tenants.get.invalidate({ id })
  }

  if (detail.isLoading) {
    return (
      <Modal open onClose={onClose} title="פרטי דייר">
        <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
      </Modal>
    )
  }
  if (detail.isError || !detail.data) {
    return (
      <Modal open onClose={onClose} title="פרטי דייר">
        <div className="text-center py-6 text-sc-danger text-[13px]">{detail.error?.message ?? 'דייר לא נמצא'}</div>
      </Modal>
    )
  }

  return (
    <TenantDetailBody
      t={detail.data}
      buildings={buildings.data ?? []}
      onClose={onClose}
      onChanged={invalidate}
      toast={toast}
    />
  )
}

type Toast = ReturnType<typeof useToast>

function TenantDetailBody({
  t, buildings, onClose, onChanged, toast,
}: {
  t: GodTenantDetail
  buildings: { id: string; label: string }[]
  onClose: () => void
  onChanged: () => void
  toast: Toast
}) {
  const tp = (t.tenant_profile ?? {}) as Record<string, unknown>

  // ── edit profile form state ──
  const [fullName, setFullName] = useState(t.full_name ?? '')
  const [phone, setPhone] = useState(t.phone ?? '')
  const [apartment, setApartment] = useState(
    tp.apartment_number != null ? String(tp.apartment_number) : '',
  )
  const [ownership, setOwnership] = useState(
    tp.ownership_percentage != null ? String(tp.ownership_percentage) : '',
  )

  // ── vaad state ──
  const [chair, setChair] = useState(!!tp.is_committee_chair)
  const [member, setMember] = useState(!!tp.is_committee_member)
  const [organizer, setOrganizer] = useState(!!tp.is_organizer)

  // ── move building ──
  const [targetBuilding, setTargetBuilding] = useState(
    tp.building_id != null ? String(tp.building_id) : '',
  )

  const [confirmDelete, setConfirmDelete] = useState(false)

  const editM = trpc.god.tenants.editTenantProfile.useMutation({
    onSuccess: () => { toast.show('פרופיל הדייר עודכן'); onChanged() },
    onError: e => toast.show(e.message),
  })
  const vaadM = trpc.god.tenants.setVaadRoles.useMutation({
    onSuccess: () => { toast.show('הרכב הוועד עודכן'); onChanged() },
    onError: e => toast.show(e.message),
  })
  const moveM = trpc.god.tenants.moveBuilding.useMutation({
    onSuccess: () => { toast.show('הדייר הועבר לבניין החדש'); onChanged() },
    onError: e => toast.show(e.message),
  })
  const banM = trpc.god.tenants.setBanned.useMutation({
    onSuccess: () => { toast.show('סטטוס ההשבתה עודכן'); onChanged() },
    onError: e => toast.show(e.message),
  })
  const delM = trpc.god.tenants.deleteTenant.useMutation({
    onSuccess: () => {
      toast.show('הדייר נמחק לצמיתות')
      setConfirmDelete(false)
      onChanged()
      onClose()
    },
    onError: e => { toast.show(e.message); setConfirmDelete(false) },
  })

  const ownershipNum = ownership.trim() === '' ? null : Number(ownership)
  const ownershipInvalid =
    ownershipNum !== null && (Number.isNaN(ownershipNum) || ownershipNum < 0 || ownershipNum > 100)

  const buildingChanged = (targetBuilding || null) !== ((tp.building_id as string) || null)
  const vaadChanged =
    chair !== !!tp.is_committee_chair ||
    member !== !!tp.is_committee_member ||
    organizer !== !!tp.is_organizer

  const anyBusy = editM.isLoading || vaadM.isLoading || moveM.isLoading || banM.isLoading

  return (
    <Modal
      open
      onClose={onClose}
      title={`דייר: ${t.full_name || t.email || t.id}`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>סגור</Button>
        </div>
      }
    >
      <div className="space-y-5 text-[13px]">
        {/* Identity summary */}
        <div className="space-y-1">
          <Row label="אימייל" value={t.email || '—'} />
          {t.building_label && <Row label="בניין נוכחי" value={t.building_label} />}
          <Row
            label="סטטוס"
            value={
              t.banned ? <Pill kind="danger">מושבת</Pill> : <Pill kind="success">פעיל</Pill>
            }
          />
          <div className="flex gap-2 flex-wrap pt-1">
            <VaadPills t={{ is_committee_chair: !!tp.is_committee_chair, is_committee_member: !!tp.is_committee_member, is_organizer: !!tp.is_organizer }} />
          </div>
        </div>

        {/* Edit profile */}
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
              <div className={labelCls}>מספר דירה</div>
              <input className={inputCls} value={apartment} onChange={e => setApartment(e.target.value)} />
            </div>
            <div>
              <div className={labelCls}>אחוז בעלות (0–100)</div>
              <input
                className={inputCls}
                value={ownership}
                onChange={e => setOwnership(e.target.value)}
                inputMode="decimal"
                placeholder="לדוגמה 25"
              />
              {ownershipInvalid && (
                <div className="text-sc-danger text-[11px] mt-1">ערך חייב להיות בין 0 ל-100</div>
              )}
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button
              size="sm"
              loading={editM.isLoading}
              disabled={ownershipInvalid}
              onClick={() =>
                editM.mutate({
                  id: t.id,
                  full_name: fullName,
                  phone: phone.trim() === '' ? null : phone,
                  apartment_number: apartment.trim() === '' ? null : apartment,
                  ownership_percentage: ownershipNum,
                })
              }
            >שמור פרופיל</Button>
          </div>
        </Section>

        {/* Vaad roles — "change the vaad" */}
        <Section title="הרכב הוועד">
          <div className="space-y-2">
            <Toggle label={'יו"ר ועד'} checked={chair} onChange={setChair} icon={<Crown size={14} />} />
            <Toggle label="חבר ועד" checked={member} onChange={setMember} icon={<ShieldCheck size={14} />} />
            <Toggle label="מארגן" checked={organizer} onChange={setOrganizer} icon={<Flag size={14} />} />
          </div>
          <div className="flex justify-end mt-3">
            <Button
              size="sm"
              loading={vaadM.isLoading}
              disabled={!vaadChanged}
              onClick={() =>
                vaadM.mutate({
                  id: t.id,
                  is_committee_chair: chair,
                  is_committee_member: member,
                  is_organizer: organizer,
                })
              }
            >עדכן ועד</Button>
          </div>
        </Section>

        {/* Move building */}
        <Section title="העברת בניין">
          <select
            className={inputCls}
            value={targetBuilding}
            onChange={e => setTargetBuilding(e.target.value)}
          >
            <option value="">— בחר/י בניין —</option>
            {buildings.map(b => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
          <div className="flex justify-end mt-3">
            <Button
              size="sm"
              variant="secondary"
              loading={moveM.isLoading}
              disabled={!targetBuilding || !buildingChanged}
              onClick={() => moveM.mutate({ id: t.id, building_id: targetBuilding })}
            >העבר בניין</Button>
          </div>
        </Section>

        {/* Danger zone */}
        <Section title="אזור מסוכן" danger>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sc-text-secondary">
                {t.banned
                  ? 'הדייר מושבת — לא יכול להתחבר. ניתן לבטל בכל עת.'
                  : 'השבתה זמנית מונעת התחברות. פעולה הפיכה.'}
              </div>
              <Button
                size="sm"
                variant={t.banned ? 'secondary' : 'danger'}
                icon={<Ban size={14} />}
                loading={banM.isLoading}
                disabled={anyBusy && !banM.isLoading}
                onClick={() => banM.mutate({ id: t.id, banned: !t.banned })}
              >{t.banned ? 'בטל השבתה' : 'השבת'}</Button>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-sc-border pt-2">
              <div className="text-sc-text-secondary">
                מחיקה לצמיתות תסיר את הדייר וכל הנתונים הקשורים אליו. בלתי-הפיכה.
              </div>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={14} />}
                onClick={() => setConfirmDelete(true)}
              >מחק לצמיתות</Button>
            </div>
          </div>
        </Section>
      </div>

      <DangerConfirm
        open={confirmDelete}
        title="מחיקת דייר לצמיתות"
        confirmText={t.email ?? ''}
        confirmLabel="מחק לצמיתות"
        loading={delM.isLoading}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => delM.mutate({ id: t.id, confirm_email: t.email ?? '' })}
        body={
          <div className="space-y-2">
            <p className="m-0">
              פעולה זו מוחקת את <b>{t.full_name || t.email}</b> וכל הנתונים הקשורים
              (דירה, חתימות, הצבעות, מסמכים ועוד) באופן בלתי-הפיך.
            </p>
            <p className="m-0 text-sc-danger">
              אם הדייר משמש כיו"ר ועד במשא ומתן פעיל — המחיקה תיחסם עד להחלפת היו"ר.
            </p>
          </div>
        }
      />
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

function Toggle({
  label, checked, onChange, icon,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 accent-sc-primary"
      />
      {icon}
      <span>{label}</span>
    </label>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <div className="text-sc-text-secondary w-28 shrink-0">{label}</div>
      <div className="flex-1 break-words">{value}</div>
    </div>
  )
}
