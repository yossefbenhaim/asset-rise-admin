import { useMemo, useState } from 'react'
import {
  Building2,
  ArrowRight,
  Pencil,
  GitBranch,
  UserCog,
  Trash2,
  Users as UsersIcon,
} from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { Modal } from '@/components/ui/Modal'
import { DangerConfirm } from '@/components/ui/DangerConfirm'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import {
  PROJECT_STAGE_IDS,
  PROJECT_STAGE_LABEL,
  PROJECT_ROLE_SLOTS,
  type ProjectRoleSlot,
  type GodBuildingDetail,
} from '@asset-rise/shared'

// Derive the project shape from the shared response type rather than the tRPC
// hook's ReturnType (which collapses to `{}` under `tsc -b` project refs).
type GodProject = NonNullable<GodBuildingDetail['project']>

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[13px]'

const SLOT_LABEL: Record<ProjectRoleSlot, string> = {
  coordinator: 'גורם מארגן',
  lawyer: 'עו״ד',
  developer: 'יזם',
}

function stageLabel(stage: string | null | undefined): string {
  if (!stage) return '—'
  return (PROJECT_STAGE_LABEL as Record<string, string>)[stage] ?? stage
}

// God-mode: Buildings + Projects. List → drill-in detail with all writes
// (edit address / force stage / reassign active role / hard-delete).
export default function GodBuildings() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return selectedId ? (
    <BuildingDetail id={selectedId} onBack={() => setSelectedId(null)} />
  ) : (
    <BuildingList onSelect={setSelectedId} />
  )
}

// ── List ─────────────────────────────────────────────────────────────────────
function BuildingList({ onSelect }: { onSelect: (id: string) => void }) {
  const [q, setQ] = useState('')
  const list = trpc.god.buildings.list.useQuery()

  const rows = useMemo(() => {
    const data = list.data ?? []
    const term = q.trim().toLowerCase()
    if (!term) return data
    return data.filter(b =>
      [b.address, b.city, b.street, b.building_number]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(term)),
    )
  }, [list.data, q])

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>בניינים ופרויקטים — מנהל-על</h1>
      </div>

      <ControlPanel
        title="שליטה בבניינים ופרויקטים"
        description="צפייה וכל פעולות העריכה ההרסניות על בניינים ופרויקטים. כל פעולה נרשמת ביומן הביקורת."
        tone="navy"
      >
        <input
          className={inputCls}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="סינון לפי עיר / רחוב / מספר…"
        />
      </ControlPanel>

      <Card className="mt-4">
        <CardHeader title="כל הבניינים" meta={<Pill kind="info">{rows.length}</Pill>} />
        <CardBody>
          {list.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : list.isError ? (
            <div className="text-center py-6 text-sc-danger text-[13px]">{list.error.message}</div>
          ) : !rows.length ? (
            <EmptyState icon={<Building2 size={28} />} title="אין בניינים" body="לא נמצאו בניינים תואמים." />
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>עיר</th>
                    <th>כתובת</th>
                    <th>דיירים</th>
                    <th>פרויקטים</th>
                    <th>שלב נוכחי</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(b => (
                    <tr key={b.id}>
                      <td className="font-semibold">{b.city ?? '—'}</td>
                      <td>{b.address || '—'}</td>
                      <td>{b.tenant_count}</td>
                      <td>{b.project_count}</td>
                      <td>
                        {b.current_stage ? (
                          <Pill kind="success">{stageLabel(b.current_stage)}</Pill>
                        ) : (
                          <Pill kind="neutral">ללא פרויקט</Pill>
                        )}
                      </td>
                      <td>
                        <Button size="sm" variant="ghost" onClick={() => onSelect(b.id)}>
                          פתח
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
    </div>
  )
}

// ── Detail ───────────────────────────────────────────────────────────────────
function BuildingDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const toast = useToast()
  const utils = trpc.useContext()
  const detail = trpc.god.buildings.get.useQuery({ id })
  const providers = trpc.god.buildings.providerOptions.useQuery()

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  function refresh() {
    utils.god.buildings.get.invalidate({ id })
    utils.god.buildings.list.invalidate()
  }

  const d = detail.data

  if (detail.isLoading) {
    return (
      <div className="sc-page">
        <div className="text-center py-10 text-sc-text-secondary text-[13px]">טוען…</div>
      </div>
    )
  }
  if (detail.isError) {
    return (
      <div className="sc-page">
        <Button size="sm" variant="ghost" icon={<ArrowRight size={16} />} onClick={onBack}>
          חזרה
        </Button>
        <div className="text-center py-10 text-sc-danger text-[13px]">{detail.error.message}</div>
      </div>
    )
  }
  if (!d) return null

  return (
    <div className="sc-page">
      <div className="sc-page__head flex items-center justify-between">
        <h1>{d.address || 'בניין'}</h1>
        <Button size="sm" variant="ghost" icon={<ArrowRight size={16} />} onClick={onBack}>
          חזרה לרשימה
        </Button>
      </div>

      {/* Address / building edit */}
      <ControlPanel
        title="פרטי בניין"
        description="עריכת כתובת הבניין (עיר / רחוב / מספר)."
        tone="navy"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[13px]">
          <div>
            <span className="text-[12px] text-sc-text-secondary block mb-1">עיר</span>
            <div className="font-semibold">{d.city ?? '—'}</div>
          </div>
          <div>
            <span className="text-[12px] text-sc-text-secondary block mb-1">רחוב</span>
            <div className="font-semibold">{d.street ?? '—'}</div>
          </div>
          <div>
            <span className="text-[12px] text-sc-text-secondary block mb-1">מספר</span>
            <div className="font-semibold">{d.building_number ?? '—'}</div>
          </div>
        </div>
        <div className="mt-3">
          <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => setEditOpen(true)}>
            ערוך כתובת
          </Button>
        </div>
      </ControlPanel>

      {/* Project: stage + active roles */}
      <div className="mt-4">
        {d.project ? (
          <ProjectSection
            project={d.project}
            providers={providers.data ?? []}
            onChanged={refresh}
          />
        ) : (
          <Card>
            <CardBody>
              <EmptyState
                icon={<GitBranch size={28} />}
                title="לא נפתח פרויקט"
                body="לבניין זה אין פרויקט פעיל, ולכן אין שלב או תפקידים לשיוך."
              />
            </CardBody>
          </Card>
        )}
      </div>

      {/* Linked providers */}
      <Card className="mt-4">
        <CardHeader
          title="ספקים מקושרים"
          meta={<Pill kind="info">{d.linked_providers.length}</Pill>}
        />
        <CardBody>
          {!d.linked_providers.length ? (
            <div className="text-center py-4 text-sc-text-secondary text-[13px]">אין ספקים מקושרים</div>
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>שם</th>
                    <th>אימייל</th>
                    <th>סוג</th>
                    <th>תפקיד בפרויקט</th>
                  </tr>
                </thead>
                <tbody>
                  {d.linked_providers.map(p => (
                    <tr key={p.provider_id}>
                      <td className="font-semibold">{p.full_name ?? '—'}</td>
                      <td className="text-[12px]">{p.email ?? '—'}</td>
                      <td>{p.provider_type ? <Pill kind="gold">{p.provider_type}</Pill> : '—'}</td>
                      <td className="text-[12px]">{p.role_in_project ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Tenants */}
      <Card className="mt-4">
        <CardHeader
          title="דיירי הבניין"
          meta={<Pill kind="info">{d.tenants.length}</Pill>}
        />
        <CardBody>
          {!d.tenants.length ? (
            <EmptyState icon={<UsersIcon size={28} />} title="אין דיירים" body="לבניין זה לא רשומים דיירים." />
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>שם</th>
                    <th>דירה</th>
                    <th>בעלות %</th>
                    <th>אימייל</th>
                    <th>טלפון</th>
                    <th>תפקידים</th>
                  </tr>
                </thead>
                <tbody>
                  {d.tenants.map(t => (
                    <tr key={t.id}>
                      <td className="font-semibold">{t.full_name ?? '—'}</td>
                      <td>{t.apartment_number ?? '—'}</td>
                      <td>{t.ownership_percentage ?? '—'}</td>
                      <td className="text-[12px]">{t.email ?? '—'}</td>
                      <td className="text-[12px]">{t.phone ?? '—'}</td>
                      <td className="space-x-1 space-x-reverse">
                        {t.is_committee_chair && <Pill kind="navy">יו״ר</Pill>}
                        {t.is_committee_member && !t.is_committee_chair && <Pill kind="info">ועד</Pill>}
                        {t.is_organizer && <Pill kind="gold">מארגן</Pill>}
                        {!t.is_committee_member && !t.is_committee_chair && !t.is_organizer && (
                          <span className="text-sc-text-muted">—</span>
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

      {/* Danger zone — hard delete */}
      <div className="mt-4">
        <ControlPanel
          title="מחיקת בניין"
          description="מחיקה לצמיתות. פעולה בלתי הפיכה — תמחק בשרשור את הפרויקט, השלבים, המשימות וכל הנתונים המקושרים."
          tone="danger"
        >
          <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setDeleteOpen(true)}>
            מחק בניין לצמיתות
          </Button>
        </ControlPanel>
      </div>

      <EditBuildingModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        building={d}
        onSaved={refresh}
      />

      <DeleteBuildingDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        id={d.id}
        address={d.address}
        tenantCount={d.tenants.length}
        onDeleted={() => {
          setDeleteOpen(false)
          toast.show('הבניין נמחק')
          onBack()
        }}
      />
    </div>
  )
}

// ── Project section: force stage + reassign roles ────────────────────────────
function ProjectSection({
  project,
  providers,
  onChanged,
}: {
  project: GodProject
  providers: { id: string; full_name: string | null; email: string | null; provider_type: string | null }[]
  onChanged: () => void
}) {
  const toast = useToast()
  const [stage, setStage] = useState<string>(project.current_stage ?? 'REGISTRATION')

  const forceStage = trpc.god.buildings.forceProjectStage.useMutation({
    onSuccess: () => {
      toast.show('שלב הפרויקט עודכן')
      onChanged()
    },
    onError: e => toast.show(e.message),
  })

  const slotRefs: Record<ProjectRoleSlot, { id: string; full_name: string | null; email: string | null } | null> = {
    coordinator: project.active_coordinator,
    lawyer: project.active_lawyer,
    developer: project.active_developer,
  }

  return (
    <ControlPanel
      title={`פרויקט: ${project.name ?? '—'}`}
      description="שינוי שלב הפרויקט ושיוך תפקידים פעילים (מארגן / עו״ד / יזם)."
      tone="navy"
    >
      {/* Force stage */}
      <div className="mb-5">
        <div className="text-[13px] font-semibold mb-2 flex items-center gap-2">
          <GitBranch size={15} /> שלב הפרויקט
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="text-[12px] text-sc-text-secondary mb-1 block">בחר/י שלב</span>
            <select className={`${inputCls} min-w-[220px]`} value={stage} onChange={e => setStage(e.target.value)}>
              {PROJECT_STAGE_IDS.map(s => (
                <option key={s} value={s}>
                  {PROJECT_STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            loading={forceStage.isLoading}
            disabled={stage === project.current_stage}
            onClick={() => forceStage.mutate({ project_id: project.id, stage: stage as any })}
          >
            עדכן שלב
          </Button>
          {project.current_stage && (
            <span className="text-[12px] text-sc-text-secondary self-center">
              נוכחי: {stageLabel(project.current_stage)}
            </span>
          )}
        </div>
      </div>

      {/* Reassign roles */}
      <div>
        <div className="text-[13px] font-semibold mb-2 flex items-center gap-2">
          <UserCog size={15} /> תפקידים פעילים
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PROJECT_ROLE_SLOTS.map(slot => (
            <RoleSlotEditor
              key={slot}
              projectId={project.id}
              slot={slot}
              current={slotRefs[slot]}
              providers={providers}
              onChanged={onChanged}
            />
          ))}
        </div>
      </div>
    </ControlPanel>
  )
}

function RoleSlotEditor({
  projectId,
  slot,
  current,
  providers,
  onChanged,
}: {
  projectId: string
  slot: ProjectRoleSlot
  current: { id: string; full_name: string | null; email: string | null } | null
  providers: { id: string; full_name: string | null; email: string | null; provider_type: string | null }[]
  onChanged: () => void
}) {
  const toast = useToast()
  const [value, setValue] = useState<string>(current?.id ?? '')

  const reassign = trpc.god.buildings.reassignRole.useMutation({
    onSuccess: () => {
      toast.show('התפקיד עודכן')
      onChanged()
    },
    onError: e => toast.show(e.message),
  })

  const dirty = (value || null) !== (current?.id ?? null)

  return (
    <div className="border border-sc-border rounded-sc-input p-3">
      <div className="text-[12px] text-sc-text-secondary mb-1">{SLOT_LABEL[slot]}</div>
      <div className="text-[12px] mb-2 truncate">
        {current ? (
          <span className="font-semibold">{current.full_name || current.email || current.id}</span>
        ) : (
          <span className="text-sc-text-muted">לא משויך</span>
        )}
      </div>
      <select className={inputCls} value={value} onChange={e => setValue(e.target.value)}>
        <option value="">— ללא —</option>
        {providers.map(p => (
          <option key={p.id} value={p.id}>
            {(p.full_name || p.email || p.id) + (p.provider_type ? ` · ${p.provider_type}` : '')}
          </option>
        ))}
      </select>
      <div className="mt-2">
        <Button
          size="sm"
          variant="secondary"
          loading={reassign.isLoading}
          disabled={!dirty}
          onClick={() =>
            reassign.mutate({ project_id: projectId, slot, provider_id: value || null })
          }
        >
          שמור
        </Button>
      </div>
    </div>
  )
}

// ── Edit building modal ──────────────────────────────────────────────────────
function EditBuildingModal({
  open,
  onClose,
  building,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  building: { id: string; city: string | null; street: string | null; building_number: string | null }
  onSaved: () => void
}) {
  const toast = useToast()
  const [city, setCity] = useState(building.city ?? '')
  const [street, setStreet] = useState(building.street ?? '')
  const [number, setNumber] = useState(building.building_number ?? '')

  const edit = trpc.god.buildings.editBuilding.useMutation({
    onSuccess: () => {
      toast.show('הכתובת עודכנה')
      onSaved()
      onClose()
    },
    onError: e => toast.show(e.message),
  })

  function submit() {
    const patch: { id: string; city?: string; street?: string; building_number?: string } = { id: building.id }
    if (city.trim() && city.trim() !== (building.city ?? '')) patch.city = city.trim()
    if (street.trim() && street.trim() !== (building.street ?? '')) patch.street = street.trim()
    if (number.trim() && number.trim() !== (building.building_number ?? '')) patch.building_number = number.trim()
    if (patch.city === undefined && patch.street === undefined && patch.building_number === undefined) {
      toast.show('לא בוצעו שינויים')
      return
    }
    edit.mutate(patch)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="עריכת כתובת בניין"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
          <Button loading={edit.isLoading} onClick={submit}>שמור</Button>
        </div>
      }
    >
      <div className="space-y-3 text-[13px]">
        <label className="block">
          <span className="text-[12px] text-sc-text-secondary mb-1 block">עיר</span>
          <input className={inputCls} value={city} onChange={e => setCity(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-[12px] text-sc-text-secondary mb-1 block">רחוב</span>
          <input className={inputCls} value={street} onChange={e => setStreet(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-[12px] text-sc-text-secondary mb-1 block">מספר בית</span>
          <input className={inputCls} value={number} onChange={e => setNumber(e.target.value)} />
        </label>
      </div>
    </Modal>
  )
}

// ── Delete building dialog (type-the-address interlock) ───────────────────────
function DeleteBuildingDialog({
  open,
  onClose,
  id,
  address,
  tenantCount,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  id: string
  address: string
  tenantCount: number
  onDeleted: () => void
}) {
  const toast = useToast()
  const del = trpc.god.buildings.deleteBuilding.useMutation({
    onSuccess: onDeleted,
    onError: e => toast.show(e.message),
  })

  return (
    <DangerConfirm
      open={open}
      onClose={onClose}
      title="מחיקת בניין לצמיתות"
      confirmText={address}
      confirmLabel="מחק בניין"
      loading={del.isLoading}
      onConfirm={() => del.mutate({ id, confirm: address })}
      body={
        <div className="space-y-2">
          <p className="text-sc-danger font-semibold m-0">פעולה בלתי הפיכה!</p>
          <p className="m-0">
            מחיקת הבניין תמחק בשרשור את הפרויקט שלו, כל השלבים והמשימות, וכן {tenantCount} דיירים מקושרים
            ונתונים נוספים. לא ניתן לשחזר.
          </p>
          <p className="m-0 text-sc-text-secondary">
            אם קיימות רשומות עם הגנת מחיקה (למשל מו״מ עם יו״ר משויך) — המחיקה תיחסם ותידרש הסרה ידנית קודם.
          </p>
        </div>
      }
    />
  )
}
