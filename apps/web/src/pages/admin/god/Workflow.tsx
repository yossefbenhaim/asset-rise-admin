import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DangerConfirm } from '@/components/ui/DangerConfirm'
import { DataTable } from '@/components/ui/DataTable'
import { useToast } from '@/components/ui/Toast'
import {
  ListChecks,
  GitBranch,
  Flag,
  UserCog,
  ShieldCheck,
  Building2,
} from 'lucide-react'
import {
  PROJECT_TASK_STATUSES,
  PROJECT_TASK_STATUS_LABEL,
  PROJECT_TASK_DANGER_STATUSES,
  BUILDING_TASK_STATUSES,
  BUILDING_TASK_STATUS_LABEL,
  BUILDING_TASK_DANGER_STATUSES,
  DUAL_APPROVAL_STATUS_LABEL,
  DUAL_APPROVAL_RESOLUTIONS,
  BATON_SLOTS,
  BATON_SLOT_LABEL,
  type ProjectTaskStatus,
  type BuildingTaskStatus,
  type DualApprovalResolution,
  type BatonSlot,
  type TaskKind,
  type GodWorkflowProjectOption,
  type GodWorkflowProfileOption,
  type GodWorkflowDetail,
  type GodWorkflowProjectTask,
  type GodWorkflowBuildingTask,
  type GodWorkflowDualApproval,
  type GodWorkflowRoleRef,
} from '@asset-rise/shared/schemas/godWorkflow'

// God-mode "Workflow / Baton / Dual-approval" page (Wave 2). The operator picks
// a project, then sees its project tasks + building tasks + dual approvals + the
// baton holders, and runs the audited god writes:
//   setTaskStatus       — force a project/building task to a new status
//   reassignTask        — set the owner (owner_user_id / assigned_to)
//   setBaton            — set active_coordinator/lawyer/developer_id
//   resolveDualApproval — force a stuck approval to approved/rejected (DangerConfirm)
// Forcing a task done/skipped (project) or done/cancelled (building) and
// resolving a dual-approval BYPASS the normal workflow engine; those are gated
// behind a DangerConfirm. No hard deletes.
//
// The god.workflow router is an isolated sibling that the integration step
// merges into the god router; until that lands its procedures aren't on the
// typed tRPC client, so this page reaches them through a thin typed accessor.
// All call sites stay strongly typed against the shared schema interfaces.
type ListMutOpts = { onSuccess?: () => void; onError?: (e: { message: string }) => void }
type Mut<TInput> = { mutate: (input: TInput) => void; isLoading: boolean }
type Query<TData, TInput> = {
  useQuery: (
    input: TInput,
    opts?: { keepPreviousData?: boolean; enabled?: boolean },
  ) => {
    data?: TData
    isLoading: boolean
    isError: boolean
    error: { message: string } | null
  }
  invalidate: (input?: TInput) => Promise<void>
}

const god = trpc as unknown as {
  god: {
    workflow: {
      projects: Query<GodWorkflowProjectOption[], { q?: string; limit?: number }>
      profileOptions: Query<GodWorkflowProfileOption[], { q?: string; limit?: number }>
      get: Query<GodWorkflowDetail, { project_id: string }>
      setTaskStatus: {
        useMutation: (o: ListMutOpts) => Mut<{ kind: TaskKind; task_id: string; status: string }>
      }
      reassignTask: {
        useMutation: (
          o: ListMutOpts,
        ) => Mut<{ kind: TaskKind; task_id: string; user_id: string | null }>
      }
      setBaton: {
        useMutation: (
          o: ListMutOpts,
        ) => Mut<{ project_id: string; slot: BatonSlot; user_id: string | null }>
      }
      resolveDualApproval: {
        useMutation: (
          o: ListMutOpts,
        ) => Mut<{
          id: string
          resolution: DualApprovalResolution
          reason?: string
          confirm: string
        }>
      }
    }
  }
}

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[13px]'
const labelCls = 'text-[12px] text-sc-text-secondary mb-1 block'

function projectTaskStatusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return (PROJECT_TASK_STATUS_LABEL as Record<string, string>)[s] ?? s
}
function buildingTaskStatusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return (BUILDING_TASK_STATUS_LABEL as Record<string, string>)[s] ?? s
}
function dualStatusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return (DUAL_APPROVAL_STATUS_LABEL as Record<string, string>)[s] ?? s
}
function taskStatusKind(s: string | null | undefined): string {
  switch (s) {
    case 'done':
      return 'success'
    case 'skipped':
    case 'cancelled':
    case 'blocked':
      return 'danger'
    case 'in_progress':
    case 'awaiting_approval':
      return 'gold'
    case 'open':
      return 'info'
    default:
      return 'neutral'
  }
}
function dualStatusKind(s: string | null | undefined): string {
  switch (s) {
    case 'approved':
      return 'success'
    case 'rejected':
    case 'expired':
      return 'danger'
    default:
      return 'gold'
  }
}

function refRender(r: GodWorkflowRoleRef | null): React.ReactNode {
  if (!r) return <Pill kind="neutral">לא משויך</Pill>
  return <span>{r.full_name || r.email || r.id}</span>
}

export default function GodWorkflow() {
  const [q, setQ] = useState('')
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  const projects = god.god.workflow.projects.useQuery(
    { q: q.trim() || undefined, limit: 300 },
    { keepPreviousData: true },
  )

  type ProjectRow = NonNullable<typeof projects.data>[number] & Record<string, unknown>
  const columns = useMemo<ColumnDef<ProjectRow, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'פרויקט',
        accessorFn: r => r.name ?? '',
        cell: ({ row }) => <span className="font-semibold">{row.original.name ?? '—'}</span>,
      },
      {
        id: 'building_address',
        header: 'בניין',
        accessorFn: r => r.building_address ?? '',
        cell: ({ row }) => <span>{row.original.building_address ?? '—'}</span>,
      },
      {
        id: 'current_stage',
        header: 'שלב נוכחי',
        accessorFn: r => r.current_stage ?? '',
        cell: ({ row }) => <Pill kind="neutral">{row.original.current_stage ?? '—'}</Pill>,
      },
    ],
    [],
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>תהליך, מקל-שרביט ואישור כפול — מנהל-על</h1>
          <div className="sub">
            שליטה בתהליך העבודה של הפרויקט — שלבים, משימות, שרביט, אישורים כפולים
          </div>
        </div>
      </div>

      <ControlPanel
        title="שליטה בתהליך הפרויקט"
        description="כפיית סטטוס משימות (פרויקט/בניין), שיוך אחראי, החלפת מחזיק המקל (גורם מלווה/עו״ד/יזם) והכרעה כפויה של אישור כפול תקוע. כפיית השלמה/דילוג של משימה וכן הכרעת אישור כפול עוקפות את מנוע התהליך הרגיל. כל פעולה נרשמת ביומן הביקורת."
        tone="danger"
      >
        <input
          className={inputCls}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="חיפוש פרויקט לפי שם / כתובת בניין…"
        />
        <div className="mt-3">
          <div className="text-[12px] text-sc-text-secondary mb-1">
            בחר/י פרויקט מהרשימה למטה כדי לבצע את פעולות-העל הזמינות:
          </div>
          <div className="flex flex-wrap gap-2 text-[12px]">
            <span className="inline-flex items-center gap-1 rounded-sc-input border border-sc-border px-2 py-1">
              <Flag size={13} /> החלפת מחזיק המקל
            </span>
            <span className="inline-flex items-center gap-1 rounded-sc-input border border-sc-border px-2 py-1">
              <GitBranch size={13} /> כפיית סטטוס משימת פרויקט
            </span>
            <span className="inline-flex items-center gap-1 rounded-sc-input border border-sc-border px-2 py-1">
              <Building2 size={13} /> כפיית סטטוס משימת בניין
            </span>
            <span className="inline-flex items-center gap-1 rounded-sc-input border border-sc-border px-2 py-1">
              <UserCog size={13} /> שיוך אחראי למשימה
            </span>
            <span className="inline-flex items-center gap-1 rounded-sc-input border border-sc-border px-2 py-1">
              <ShieldCheck size={13} /> הכרעת אישור כפול תקוע
            </span>
          </div>
        </div>
      </ControlPanel>

      <Card className="mt-4">
        <CardHeader
          title="פרויקטים"
          meta={<Pill kind="info">{projects.data?.length ?? 0}</Pill>}
        />
        <CardBody>
          {projects.isError && (
            <div className="text-sc-danger text-[13px] mb-2">{projects.error?.message}</div>
          )}
          <DataTable<ProjectRow>
            columns={columns}
            data={(projects.data ?? []) as ProjectRow[]}
            loading={projects.isLoading}
            onRowClick={p => setActiveProjectId(p.id)}
            csvName="workflow-projects"
            searchPlaceholder="חיפוש פרויקט…"
            emptyTitle="אין פרויקטים"
            emptyBody="לא נמצאו פרויקטים."
          />
        </CardBody>
      </Card>

      {activeProjectId && (
        <WorkflowDetail projectId={activeProjectId} onClose={() => setActiveProjectId(null)} />
      )}
    </div>
  )
}

function WorkflowDetail({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const detail = god.god.workflow.get.useQuery({ project_id: projectId })

  if (detail.isLoading) {
    return (
      <Modal open onClose={onClose} title="תהליך הפרויקט">
        <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
      </Modal>
    )
  }
  if (detail.isError || !detail.data) {
    return (
      <Modal open onClose={onClose} title="תהליך הפרויקט">
        <div className="text-center py-6 text-sc-danger text-[13px]">
          {detail.error?.message ?? 'לא נמצא'}
        </div>
      </Modal>
    )
  }
  return <WorkflowDetailBody d={detail.data} onClose={onClose} />
}

function WorkflowDetailBody({ d, onClose }: { d: GodWorkflowDetail; onClose: () => void }) {
  const toast = useToast()
  const [profileQ, setProfileQ] = useState('')

  // Profile options for the reassign / setBaton dropdowns.
  const profiles = god.god.workflow.profileOptions.useQuery(
    { q: profileQ.trim() || undefined, limit: 50 },
    { keepPreviousData: true },
  )
  const profileList = profiles.data ?? []

  function refresh() {
    void god.god.workflow.get.invalidate({ project_id: d.project_id })
    void god.god.workflow.projects.invalidate()
  }

  const setTaskStatusM = god.god.workflow.setTaskStatus.useMutation({
    onSuccess: () => {
      toast.show('סטטוס המשימה עודכן')
      refresh()
    },
    onError: e => toast.show(e.message),
  })
  const reassignM = god.god.workflow.reassignTask.useMutation({
    onSuccess: () => {
      toast.show('אחראי המשימה עודכן')
      refresh()
    },
    onError: e => toast.show(e.message),
  })
  const setBatonM = god.god.workflow.setBaton.useMutation({
    onSuccess: () => {
      toast.show('מחזיק המקל עודכן')
      refresh()
    },
    onError: e => toast.show(e.message),
  })
  const resolveM = god.god.workflow.resolveDualApproval.useMutation({
    onSuccess: () => {
      toast.show('בקשת האישור הוכרעה')
      setResolveTarget(null)
      refresh()
    },
    onError: e => toast.show(e.message),
  })

  const [resolveTarget, setResolveTarget] = useState<{
    approval: GodWorkflowDualApproval
    resolution: DualApprovalResolution
    reason: string
  } | null>(null)

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`תהליך: ${d.project_name || d.project_id}`}
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
            <Row label="פרויקט" value={d.project_name || '—'} />
            <Row label="בניין" value={d.building_address || '—'} />
            <Row label="שלב נוכחי" value={<Pill kind="neutral">{d.current_stage ?? '—'}</Pill>} />
          </div>

          {/* Baton */}
          <Section title="מחזיקי המקל (Baton)" icon={<Flag size={15} />} danger>
            <p className="text-sc-text-secondary text-[12px] m-0 mb-2">
              קביעת active_coordinator/lawyer/developer_id ישירות. ריקון = בחירת «—».
            </p>
            <ProfileSearchBox value={profileQ} onChange={setProfileQ} loading={profiles.isLoading} />
            <div className="space-y-2 mt-2">
              {BATON_SLOTS.map(slot => (
                <BatonRow
                  key={slot}
                  slot={slot}
                  current={
                    slot === 'coordinator'
                      ? d.active_coordinator
                      : slot === 'lawyer'
                        ? d.active_lawyer
                        : d.active_developer
                  }
                  profileList={profileList}
                  loading={setBatonM.isLoading}
                  onSet={user_id => setBatonM.mutate({ project_id: d.project_id, slot, user_id })}
                />
              ))}
            </div>
          </Section>

          {/* Project tasks */}
          <Section title={`משימות פרויקט (${d.project_tasks.length})`} icon={<GitBranch size={15} />}>
            {!d.project_tasks.length ? (
              <div className="text-sc-text-secondary">אין משימות פרויקט.</div>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {d.project_tasks.map(t => (
                  <ProjectTaskRow
                    key={t.id}
                    task={t}
                    profileList={profileList}
                    statusLoading={setTaskStatusM.isLoading}
                    reassignLoading={reassignM.isLoading}
                    onSetStatus={status =>
                      setTaskStatusM.mutate({ kind: 'project', task_id: t.id, status })
                    }
                    onReassign={user_id =>
                      reassignM.mutate({ kind: 'project', task_id: t.id, user_id })
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          {/* Building tasks */}
          <Section
            title={`משימות בניין (${d.building_tasks.length})`}
            icon={<Building2 size={15} />}
          >
            {!d.building_tasks.length ? (
              <div className="text-sc-text-secondary">אין משימות בניין.</div>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {d.building_tasks.map(t => (
                  <BuildingTaskRow
                    key={t.id}
                    task={t}
                    profileList={profileList}
                    statusLoading={setTaskStatusM.isLoading}
                    reassignLoading={reassignM.isLoading}
                    onSetStatus={status =>
                      setTaskStatusM.mutate({ kind: 'building', task_id: t.id, status })
                    }
                    onReassign={user_id =>
                      reassignM.mutate({ kind: 'building', task_id: t.id, user_id })
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          {/* Dual approvals */}
          <Section
            title={`אישורים כפולים (${d.dual_approvals.length})`}
            icon={<ShieldCheck size={15} />}
            danger
          >
            {!d.dual_approvals.length ? (
              <div className="text-sc-text-secondary">אין בקשות אישור כפול.</div>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {d.dual_approvals.map(a => {
                  const terminal = a.status === 'approved' || a.status === 'rejected'
                  return (
                    <div key={a.id} className="border border-sc-border rounded-sc-input p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold break-words">{a.action || '—'}</div>
                          <div className="text-[11px] text-sc-text-muted">
                            {a.primary_name || '—'} → {a.approver_name || '—'}
                          </div>
                          {a.reason && (
                            <div className="text-[11px] text-sc-text-secondary mt-1 break-words">
                              {a.reason}
                            </div>
                          )}
                        </div>
                        <Pill kind={dualStatusKind(a.status) as any}>{dualStatusLabel(a.status)}</Pill>
                      </div>
                      {!terminal && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {DUAL_APPROVAL_RESOLUTIONS.map(res => (
                            <Button
                              key={res}
                              size="sm"
                              variant={res === 'rejected' ? 'danger' : 'primary'}
                              onClick={() =>
                                setResolveTarget({ approval: a, resolution: res, reason: '' })
                              }
                            >
                              {res === 'approved' ? 'כפה אישור' : 'כפה דחייה'}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Section>
        </div>
      </Modal>

      {resolveTarget && (
        <DangerConfirm
          open
          onClose={() => setResolveTarget(null)}
          title={resolveTarget.resolution === 'approved' ? 'כפיית אישור כפול' : 'כפיית דחיית אישור כפול'}
          confirmText={resolveTarget.approval.action || resolveTarget.approval.id}
          confirmLabel={resolveTarget.resolution === 'approved' ? 'כפה אישור' : 'כפה דחייה'}
          loading={resolveM.isLoading}
          onConfirm={() =>
            resolveM.mutate({
              id: resolveTarget.approval.id,
              resolution: resolveTarget.resolution,
              reason: resolveTarget.reason.trim() || undefined,
              confirm: resolveTarget.approval.action || resolveTarget.approval.id,
            })
          }
          body={
            <div className="space-y-2">
              <p className="text-sc-danger font-semibold m-0">פעולה עוקפת תהליך!</p>
              <p className="m-0">
                הכרעה כפויה של בקשת האישור הכפול עוקפת את החתימה הדו-צדדית. שני צדדי החתימה יסומנו
                כחתומים והסטטוס ייקבע ל«{dualStatusLabel(resolveTarget.resolution)}».
              </p>
              <label className="block">
                <span className={labelCls}>נימוק (לא חובה)</span>
                <input
                  className={inputCls}
                  value={resolveTarget.reason}
                  onChange={e =>
                    setResolveTarget(prev => (prev ? { ...prev, reason: e.target.value } : prev))
                  }
                  placeholder="נימוק לרישום ביומן"
                />
              </label>
            </div>
          }
        />
      )}
    </>
  )
}

function ProfileSearchBox({
  value,
  onChange,
  loading,
}: {
  value: string
  onChange: (v: string) => void
  loading?: boolean
}) {
  return (
    <label className="block">
      <span className={labelCls}>חיפוש משתמש לשיוך {loading ? '(טוען…)' : ''}</span>
      <input
        className={inputCls}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="שם / אימייל…"
      />
    </label>
  )
}

function BatonRow({
  slot,
  current,
  profileList,
  loading,
  onSet,
}: {
  slot: BatonSlot
  current: GodWorkflowRoleRef | null
  profileList: GodWorkflowProfileOption[]
  loading?: boolean
  onSet: (user_id: string | null) => void
}) {
  const [sel, setSel] = useState<string>(current?.id ?? '')
  return (
    <div className="flex flex-wrap items-end gap-2 border border-sc-border rounded-sc-input p-2">
      <div className="min-w-[120px]">
        <span className={labelCls}>{BATON_SLOT_LABEL[slot]}</span>
        <div className="text-[12px]">{refRender(current)}</div>
      </div>
      <label className="block flex-1 min-w-[180px]">
        <span className={labelCls}>שינוי</span>
        <select className={inputCls} value={sel} onChange={e => setSel(e.target.value)}>
          <option value="">— ללא —</option>
          {profileList.map(p => (
            <option key={p.id} value={p.id}>
              {(p.full_name || p.email || p.id) + (p.role ? ` · ${p.role}` : '')}
            </option>
          ))}
        </select>
      </label>
      <Button
        size="sm"
        icon={<UserCog size={14} />}
        loading={loading}
        disabled={(sel || null) === (current?.id ?? null)}
        onClick={() => onSet(sel || null)}
      >
        קבע
      </Button>
    </div>
  )
}

function ProjectTaskRow({
  task,
  profileList,
  statusLoading,
  reassignLoading,
  onSetStatus,
  onReassign,
}: {
  task: GodWorkflowProjectTask
  profileList: GodWorkflowProfileOption[]
  statusLoading?: boolean
  reassignLoading?: boolean
  onSetStatus: (status: ProjectTaskStatus) => void
  onReassign: (user_id: string | null) => void
}) {
  const [status, setStatus] = useState<string>(task.status ?? 'open')
  const [owner, setOwner] = useState<string>(task.owner_user_id ?? '')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const dangerous = PROJECT_TASK_DANGER_STATUSES.includes(status as ProjectTaskStatus)

  return (
    <div className="border border-sc-border rounded-sc-input p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold break-words">{task.title || task.slug || '—'}</div>
          <div className="text-[11px] text-sc-text-muted">
            {task.stage_id ?? '—'}
            {task.required ? ' · חובה' : ''} · אחראי: {task.owner_name || task.owner_role || '—'}
          </div>
        </div>
        <Pill kind={taskStatusKind(task.status) as any}>{projectTaskStatusLabel(task.status)}</Pill>
      </div>

      <div className="flex flex-wrap items-end gap-2 mt-2">
        <label className="block">
          <span className={labelCls}>סטטוס</span>
          <select
            className={`${inputCls} min-w-[150px]`}
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            {PROJECT_TASK_STATUSES.map(s => (
              <option key={s} value={s}>
                {PROJECT_TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant={dangerous ? 'danger' : 'primary'}
          loading={statusLoading}
          disabled={status === task.status}
          onClick={() => (dangerous ? setConfirmOpen(true) : onSetStatus(status as ProjectTaskStatus))}
        >
          עדכן סטטוס
        </Button>

        <label className="block flex-1 min-w-[160px]">
          <span className={labelCls}>אחראי</span>
          <select className={inputCls} value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">— ללא —</option>
            {profileList.map(p => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email || p.id}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="ghost"
          icon={<UserCog size={14} />}
          loading={reassignLoading}
          disabled={(owner || null) === (task.owner_user_id ?? null)}
          onClick={() => onReassign(owner || null)}
        >
          שייך
        </Button>
      </div>

      <DangerConfirm
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="כפיית סטטוס משימה"
        confirmText={task.title || task.slug || task.id}
        confirmLabel="כפה סטטוס"
        loading={statusLoading}
        onConfirm={() => {
          onSetStatus(status as ProjectTaskStatus)
          setConfirmOpen(false)
        }}
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0">פעולה עוקפת תהליך!</p>
            <p className="m-0">
              שינוי הסטטוס ל«{projectTaskStatusLabel(status)}» עוקף את שערי-התלות של מנוע התהליך.
            </p>
          </div>
        }
      />
    </div>
  )
}

function BuildingTaskRow({
  task,
  profileList,
  statusLoading,
  reassignLoading,
  onSetStatus,
  onReassign,
}: {
  task: GodWorkflowBuildingTask
  profileList: GodWorkflowProfileOption[]
  statusLoading?: boolean
  reassignLoading?: boolean
  onSetStatus: (status: BuildingTaskStatus) => void
  onReassign: (user_id: string | null) => void
}) {
  const [status, setStatus] = useState<string>(task.status ?? 'open')
  const [owner, setOwner] = useState<string>(task.assigned_to ?? '')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const dangerous = BUILDING_TASK_DANGER_STATUSES.includes(status as BuildingTaskStatus)

  return (
    <div className="border border-sc-border rounded-sc-input p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold break-words">{task.title || '—'}</div>
          <div className="text-[11px] text-sc-text-muted">
            {task.kind ?? '—'}
            {task.priority ? ` · ${task.priority}` : ''} · אחראי:{' '}
            {task.assignee_name || task.assigned_role || '—'}
          </div>
        </div>
        <Pill kind={taskStatusKind(task.status) as any}>{buildingTaskStatusLabel(task.status)}</Pill>
      </div>

      <div className="flex flex-wrap items-end gap-2 mt-2">
        <label className="block">
          <span className={labelCls}>סטטוס</span>
          <select
            className={`${inputCls} min-w-[150px]`}
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            {BUILDING_TASK_STATUSES.map(s => (
              <option key={s} value={s}>
                {BUILDING_TASK_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant={dangerous ? 'danger' : 'primary'}
          loading={statusLoading}
          disabled={status === task.status}
          onClick={() =>
            dangerous ? setConfirmOpen(true) : onSetStatus(status as BuildingTaskStatus)
          }
        >
          עדכן סטטוס
        </Button>

        <label className="block flex-1 min-w-[160px]">
          <span className={labelCls}>אחראי</span>
          <select className={inputCls} value={owner} onChange={e => setOwner(e.target.value)}>
            <option value="">— ללא —</option>
            {profileList.map(p => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email || p.id}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="ghost"
          icon={<UserCog size={14} />}
          loading={reassignLoading}
          disabled={(owner || null) === (task.assigned_to ?? null)}
          onClick={() => onReassign(owner || null)}
        >
          שייך
        </Button>
      </div>

      <DangerConfirm
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="כפיית סטטוס משימה"
        confirmText={task.title || task.id}
        confirmLabel="כפה סטטוס"
        loading={statusLoading}
        onConfirm={() => {
          onSetStatus(status as BuildingTaskStatus)
          setConfirmOpen(false)
        }}
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0">פעולה עוקפת תהליך!</p>
            <p className="m-0">
              שינוי הסטטוס ל«{buildingTaskStatusLabel(status)}» עוקף את מנוע התהליך הרגיל.
            </p>
          </div>
        }
      />
    </div>
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

// Re-export the page-local icon set marker — keeps the ListChecks import used
// for the nav even if the page is lazy-loaded before nav wiring lands.
export const GOD_WORKFLOW_NAV_ICON = ListChecks
