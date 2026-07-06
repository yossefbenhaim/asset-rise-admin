import { AlertTriangle, ListChecks, MessageCircle, FileWarning } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { dateShort } from '@/lib/format'
import { PROJECT_STAGE_LABEL, type ProjectStageId, type ProgressTask } from '@asset-rise/shared'
import { ProgressStrip } from './ProgressStrip'
import { TaskStatusPill } from './taskStatus'

// Per-user progress: where their building stands across the 14 stages + the
// user's own tasks (stuck ones first). Optional onOpenChat wires the system
// chat (Phase 2).
export function UserProgressPanel({
  userId,
  onOpenChat,
}: {
  userId: string
  onOpenChat?: () => void
}) {
  const q = trpc.god.progress.user.useQuery({ user_id: userId }, { refetchOnWindowFocus: false })
  const d = q.data

  if (q.isLoading)
    return (
      <div className="space-y-2">
        <Skeleton h={40} />
        <Skeleton h={90} />
      </div>
    )
  if (q.isError || !d) return <EmptyState title="לא ניתן לטעון התקדמות" body={q.error?.message} />

  if (!d.has_project) {
    return (
      <EmptyState
        icon={<ListChecks size={26} />}
        title="אין פרויקט פעיל"
        body={
          d.building_address
            ? `${d.building_address} — טרם נפתח פרויקט.`
            : 'המשתמש אינו משויך לפרויקט פעיל.'
        }
      />
    )
  }

  // Stuck tasks first, then open, then done; within group keep stage order.
  const order = (t: ProgressTask) =>
    t.stuck ? 0 : t.status === 'done' || t.status === 'skipped' ? 2 : 1
  const tasks = [...d.tasks].sort((a, b) => order(a) - order(b))

  return (
    <div className="flex flex-col gap-3.5">
      <ProgressStrip
        stages={d.stages}
        currentStageLabel={d.current_stage_label}
        daysAtStage={d.days_at_stage}
      />

      {/* totals */}
      <div className="flex items-center gap-2 flex-wrap text-[12px]">
        <Pill kind="info">
          {d.totals.done}/{d.totals.total} משימות הושלמו
        </Pill>
        {d.totals.open > 0 && <Pill kind="neutral">{d.totals.open} פתוחות</Pill>}
        {d.totals.stuck > 0 && (
          <span className="inline-flex items-center gap-1 text-sc-danger font-bold">
            <AlertTriangle size={14} />
            {d.totals.stuck} תקועות
          </span>
        )}
        {onOpenChat && (
          <Button
            size="sm"
            variant={d.totals.stuck > 0 ? 'primary' : 'ghost'}
            icon={<MessageCircle size={14} />}
            onClick={onOpenChat}
            className="mr-auto"
          >
            פתח צ'אט מערכת
          </Button>
        )}
      </div>

      {/* the user's tasks */}
      {tasks.length === 0 ? (
        <div className="text-[12px] text-sc-text-muted rounded-sc-input bg-sc-bg px-3 py-2">
          אין משימות המשויכות למשתמש זה בשלב הנוכחי.
        </div>
      ) : (
        <ul className="flex flex-col gap-2 m-0 p-0 list-none">
          {tasks.map(t => (
            <li
              key={t.id}
              className={`rounded-sc-input border p-2.5 ${t.stuck ? 'border-sc-danger/40 bg-sc-danger-bg/20' : 'border-sc-border bg-sc-bg/40'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-semibold text-sc-text">{t.title ?? '—'}</span>
                    {t.requires_doc && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] text-sc-text-muted"
                        title="דורש מסמך"
                      >
                        <FileWarning size={11} /> מסמך
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-sc-text-muted flex-wrap">
                    {t.stage_id && (
                      <Pill kind="neutral">
                        {PROJECT_STAGE_LABEL[t.stage_id as ProjectStageId]}
                      </Pill>
                    )}
                    {t.due_at && <span className="sc-num">יעד: {dateShort(t.due_at)}</span>}
                    {t.days_open != null && t.status !== 'done' && (
                      <span className={`sc-num ${t.stuck ? 'text-sc-danger font-semibold' : ''}`}>
                        {t.days_open} ימים פתוחה
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {t.stuck && <AlertTriangle size={14} className="text-sc-danger" />}
                  <TaskStatusPill status={t.status} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
