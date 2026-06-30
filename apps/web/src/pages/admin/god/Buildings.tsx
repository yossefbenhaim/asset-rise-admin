import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Pencil,
  GitBranch,
  UserCog,
  Trash2,
  Users as UsersIcon,
  FileUp,
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { Modal } from '@/components/ui/Modal'
import { DangerConfirm } from '@/components/ui/DangerConfirm'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import {
  PROJECT_STAGE_IDS,
  PROJECT_STAGE_LABEL,
  PROJECT_ROLE_SLOTS,
  type ProjectRoleSlot,
  type GodBuildingDetail,
  type GodBuildingListItem,
} from '@asset-rise/shared'

type Row = GodBuildingListItem & Record<string, unknown>

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
const columns: ColumnDef<Row, unknown>[] = [
  {
    id: 'city',
    header: 'עיר',
    accessorFn: r => r.city ?? '',
    cell: ({ row }) => <span className="font-semibold">{row.original.city ?? '—'}</span>,
  },
  {
    id: 'address',
    header: 'כתובת',
    accessorFn: r => r.address ?? '',
    cell: ({ row }) => row.original.address || '—',
  },
  {
    id: 'tenant_count',
    header: 'דיירים',
    accessorFn: r => r.tenant_count,
    cell: ({ row }) => row.original.tenant_count,
  },
  {
    id: 'project_count',
    header: 'פרויקטים',
    accessorFn: r => r.project_count,
    cell: ({ row }) => row.original.project_count,
  },
  {
    id: 'current_stage',
    header: 'שלב',
    accessorFn: r => r.current_stage ?? '',
    cell: ({ row }) =>
      row.original.current_stage ? (
        <Pill kind="success">{stageLabel(row.original.current_stage)}</Pill>
      ) : (
        <Pill kind="neutral">ללא פרויקט</Pill>
      ),
  },
]

function BuildingList({ onSelect }: { onSelect: (id: string) => void }) {
  const list = trpc.god.buildings.list.useQuery()
  const rows = useMemo(() => list.data ?? [], [list.data])

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>בניינים ופרויקטים — מנהל-על</h1>
          <div className="sub">
            שליטה תפעולית מלאה ופירוט עומק לכל בניין — בשונה מ«בניינים» (רשימת ה-CRM
            לקריאה), כאן רואים את כל הדיירים, הבעלים, הוועד, השלב, ומבצעים את פעולות-העל
          </div>
        </div>
      </div>

      <ControlPanel
        title="שליטה בבניינים ופרויקטים"
        description="פירוט עומק לכל בניין (דיירים, בעלים, ועד, שלב) וכל פעולות העריכה ההרסניות על בניינים ופרויקטים. בשונה ממסך «בניינים» שהוא רשימת CRM לקריאה — כאן מתבצעת השליטה התפעולית המלאה. כל פעולה נרשמת ביומן הביקורת."
        tone="navy"
      />

      <Card className="mt-4">
        <CardHeader title="כל הבניינים" meta={<Pill kind="info">{rows.length}</Pill>} />
        <CardBody>
          <DataTable
            columns={columns}
            data={rows as Row[]}
            loading={list.isLoading}
            onRowClick={b => onSelect(b.id)}
            csvName="buildings-god"
            searchPlaceholder="חיפוש בניין / עיר…"
            emptyTitle="אין בניינים"
            emptyBody="לא נמצאו בניינים."
          />
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

  // Derived tenant breakdown for the detail header. "Declared" = tenants who
  // completed their declaration (have an apartment number assigned); the rest
  // are registered but not yet declared. Owners = tenants with an ownership %.
  const stats = useMemo(() => {
    const tenants = d?.tenants ?? []
    const total = tenants.length
    const declared = tenants.filter(t => t.apartment_number != null && String(t.apartment_number).trim() !== '').length
    const owners = tenants.filter(t => t.ownership_percentage != null).length
    const committee = tenants.filter(t => t.is_committee_member || t.is_committee_chair).length
    const ownershipSum = tenants.reduce((acc, t) => acc + (Number(t.ownership_percentage) || 0), 0)
    return { total, declared, owners, committee, ownershipSum }
  }, [d])

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

      {/* Tenant breakdown stats */}
      <Card className="mt-4">
        <CardHeader title="מבט-על על הדיירים" />
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="סה״כ דיירים רשומים" value={stats.total} />
            <Stat
              label="הצהירו (עם דירה)"
              value={`${stats.declared} / ${stats.total}`}
              hint={stats.total ? `${Math.round((stats.declared / stats.total) * 100)}% השלימו הצהרה` : undefined}
            />
            <Stat label="בעלים (עם % בעלות)" value={stats.owners} />
            <Stat label="חברי ועד" value={stats.committee} />
            <Stat label="סך אחוזי בעלות" value={`${Math.round(stats.ownershipSum)}%`} />
          </div>
        </CardBody>
      </Card>

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

      {/* Documents — upload action (god upload mutation not yet available) */}
      <div className="mt-4">
        <ControlPanel
          title="מסמכי בניין"
          description="העלאת מסמך ישירות לבניין/לפרויקט ממסך מנהל-העל."
          tone="navy"
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="secondary" icon={<FileUp size={14} />} disabled>
              העלה מסמך
            </Button>
            <Pill kind="gold">בקרוב</Pill>
            <span className="text-[12px] text-sc-text-secondary">
              העלאת מסמכים ממנהל-העל עדיין אינה זמינה (אין פעולת העלאה בצד השרת). ניהול מסמכים
              קיימים (שינוי נראוּת / הסרה) מתבצע כעת במסך «מסמכים».
            </span>
          </div>
        </ControlPanel>
      </div>

      {/* Committee members */}
      <Card className="mt-4">
        <CardHeader
          title="חברי הוועד"
          meta={<Pill kind="info">{stats.committee}</Pill>}
        />
        <CardBody>
          {!d.tenants.some(t => t.is_committee_member || t.is_committee_chair) ? (
            <div className="text-center py-4 text-sc-text-secondary text-[13px]">
              לא הוגדרו חברי ועד לבניין זה
            </div>
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>שם</th>
                    <th>תפקיד בוועד</th>
                    <th>דירה</th>
                    <th>אימייל</th>
                    <th>טלפון</th>
                  </tr>
                </thead>
                <tbody>
                  {d.tenants
                    .filter(t => t.is_committee_member || t.is_committee_chair)
                    .map(t => (
                      <tr key={t.id}>
                        <td className="font-semibold">{t.full_name ?? '—'}</td>
                        <td>
                          {t.is_committee_chair ? (
                            <Pill kind="navy">יו״ר ועד</Pill>
                          ) : (
                            <Pill kind="info">חבר ועד</Pill>
                          )}
                        </td>
                        <td>{t.apartment_number ?? '—'}</td>
                        <td className="text-[12px]">{t.email ?? '—'}</td>
                        <td className="text-[12px]">{t.phone ?? '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Owners */}
      <Card className="mt-4">
        <CardHeader
          title="בעלי דירות"
          meta={<Pill kind="info">{stats.owners}</Pill>}
        />
        <CardBody>
          {!d.tenants.some(t => t.ownership_percentage != null) ? (
            <div className="text-center py-4 text-sc-text-secondary text-[13px]">
              לא נרשמו אחוזי בעלות לדיירי בניין זה
            </div>
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>שם</th>
                    <th>דירה</th>
                    <th>% בעלות</th>
                    <th>אימייל</th>
                  </tr>
                </thead>
                <tbody>
                  {d.tenants
                    .filter(t => t.ownership_percentage != null)
                    .map(t => (
                      <tr key={t.id}>
                        <td className="font-semibold">{t.full_name ?? '—'}</td>
                        <td>{t.apartment_number ?? '—'}</td>
                        <td className="font-semibold">{t.ownership_percentage}%</td>
                        <td className="text-[12px]">{t.email ?? '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Tenants (full roster) */}
      <Card className="mt-4">
        <CardHeader
          title="כל דיירי הבניין"
          meta={
            <div className="flex items-center gap-2">
              <Pill kind="info">{stats.total} רשומים</Pill>
              <Pill kind="success">{stats.declared} הצהירו</Pill>
            </div>
          }
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

// Lightweight inline stat tile for the building detail header — token-styled,
// no animation (the detail view is dense, KpiCard would be too heavy here).
function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="border border-sc-border rounded-sc-input p-3">
      <div className="text-[12px] text-sc-text-secondary mb-1">{label}</div>
      <div className="text-[20px] font-extrabold text-sc-text leading-none">{value}</div>
      {hint && <div className="text-[11px] text-sc-text-muted mt-1">{hint}</div>}
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
