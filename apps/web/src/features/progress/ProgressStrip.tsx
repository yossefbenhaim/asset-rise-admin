import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { ProgressStage } from '@asset-rise/shared'

// The 14-stage strip: a compact color-coded stepper. done=green, current=blue
// (ring), upcoming=muted. Hover any segment for its label + task tally. Header
// shows the current stage + how long the building has sat there (stuck if long).
const SEG: Record<ProgressStage['status'], string> = {
  done: 'bg-sc-success',
  current: 'bg-sc-primary ring-2 ring-sc-primary/30',
  upcoming: 'bg-sc-border',
}

export function ProgressStrip({
  stages, currentStageLabel, daysAtStage, stuckDaysThreshold = 14,
}: {
  stages: ProgressStage[]
  currentStageLabel: string | null
  daysAtStage: number | null
  stuckDaysThreshold?: number
}) {
  const doneCount = stages.filter(s => s.status === 'done').length
  const stageStuck = daysAtStage != null && daysAtStage >= stuckDaysThreshold
  const idx = stages.findIndex(s => s.status === 'current')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap text-[12px]">
        <span className="inline-flex items-center gap-1.5 font-bold text-sc-text">
          שלב נוכחי:
          <span className="text-sc-primary">{currentStageLabel ?? '—'}</span>
          {idx >= 0 && <span className="text-sc-text-muted sc-num">({idx + 1}/14)</span>}
        </span>
        {daysAtStage != null && (
          <span className={`inline-flex items-center gap-1 ${stageStuck ? 'text-sc-warning font-semibold' : 'text-sc-text-muted'}`}>
            {stageStuck && <AlertTriangle size={13} />}
            <span className="sc-num">{daysAtStage}</span> ימים בשלב
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {stages.map((s) => (
          <div
            key={s.id}
            title={`${s.label} · ${s.tasksDone}/${s.tasksTotal} משימות${s.stuckCount ? ` · ${s.stuckCount} תקועות` : ''}`}
            className={`relative h-2.5 flex-1 rounded-sc-pill transition-colors ${SEG[s.status]}`}
          >
            {s.stuckCount > 0 && (
              <span className="absolute -top-1 -left-0.5 w-1.5 h-1.5 rounded-full bg-sc-danger" />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-sc-text-muted">
        <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} className="text-sc-success" />{doneCount} הושלמו</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sc-primary" />בתהליך</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sc-border" />ממתין</span>
      </div>
    </div>
  )
}
