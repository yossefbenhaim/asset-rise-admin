// One in-processing (or just-finished / failed) job: header with property
// label + status, a live-ticking elapsed timer, the 7-stage StageBar, and —
// for failures — the failed stage + reason.
//
// The elapsed timer ticks locally every second between the 4s server polls so
// the number feels alive without hammering the API. It re-bases off the
// server's elapsedSec each time fresh data arrives.
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Clock, RefreshCcw, AlertTriangle } from 'lucide-react'
import type { ProcessingJob } from '@asset-rise/shared'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { StageBar } from './StageBar'

function fmtElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}:${String(r).padStart(2, '0')} דק׳` : `${r} ש׳`
}

// Local 1s ticker that re-seeds whenever the server's elapsedSec changes.
function useLiveElapsed(baseSec: number, live: boolean): number {
  const [extra, setExtra] = useState(0)
  useEffect(() => {
    setExtra(0)
    if (!live) return
    const id = setInterval(() => setExtra((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [baseSec, live])
  return baseSec + extra
}

export function JobCard({ job, stages, index = 0 }: {
  job: ProcessingJob
  stages: readonly string[]
  index?: number
}) {
  const isRunning = job.status === 'running'
  const elapsed = useLiveElapsed(job.elapsedSec, isRunning)
  const slow = isRunning && elapsed > 60 // heuristic "taking a while" hint

  return (
    <motion.div
      className="sc-glass p-4 flex flex-col gap-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[14px] font-bold text-sc-text truncate">
            <MapPin size={14} className="text-sc-primary shrink-0" />
            <span className="truncate" title={job.label}>{job.label}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11.5px] text-sc-text-muted">
            <span className="inline-flex items-center gap-1">
              <Clock size={12} className={slow ? 'text-sc-warning' : ''} />
              <span className={slow ? 'text-sc-warning font-semibold' : ''}>{fmtElapsed(elapsed)}</span>
            </span>
            {job.attempts != null && job.attempts > 1 && (
              <span className="inline-flex items-center gap-1">
                <RefreshCcw size={12} />
                {job.attempts} ניסיונות
              </span>
            )}
            {job.city && <span className="truncate">· {job.city}</span>}
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>

      <StageBar stages={stages} current={job.stageIndex} status={job.status} />

      {job.status === 'failed' && (
        <div className="flex items-start gap-2 rounded-sc-input bg-sc-danger-bg text-sc-danger px-3 py-2 text-[11.5px]">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div className="min-w-0">
            {job.failedStage && (
              <span className="font-bold">נכשל בשלב «{job.failedStage}»: </span>
            )}
            <span className="break-words">{job.error ?? 'שגיאה לא ידועה'}</span>
          </div>
        </div>
      )}
    </motion.div>
  )
}
