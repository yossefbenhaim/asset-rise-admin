// One in-flight AI-research job (sc_analyzer_jobs). The async research is a
// SINGLE logical step of a full evaluate — so we show an honest "AI research in
// progress" indicator with a live elapsed timer + an indeterminate bar, NOT a
// fake mapping onto the 7 pipeline stages (that misled: a finished request kept
// showing "stage 3"). Completed work is shown as real runs in RunsPanel.
//
// The elapsed timer ticks locally every second between polls so it feels alive;
// it re-bases off the server's elapsedSec on each fresh fetch.
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Clock, RefreshCcw, Sparkles } from 'lucide-react'
import type { ProcessingJob } from '@asset-rise/shared'
import { StatusBadge } from '@/components/ui/StatusBadge'

function fmtElapsed(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}:${String(r).padStart(2, '0')} דק׳` : `${r} ש׳`
}

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

export function JobCard({ job, index = 0 }: {
  job: ProcessingJob
  stages?: readonly string[]   // kept for back-compat; no longer rendered
  index?: number
}) {
  const isRunning = job.status === 'running'
  const elapsed = useLiveElapsed(job.elapsedSec, isRunning)
  const slow = isRunning && elapsed > 90 // "taking a while" hint

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
              <span className="inline-flex items-center gap-1"><RefreshCcw size={12} />{job.attempts} ניסיונות</span>
            )}
            {job.city && <span className="truncate">· {job.city}</span>}
          </div>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* Honest in-progress indicator for the async AI research (one step). */}
      <div className="flex items-center gap-2 text-[12px] text-sc-primary font-semibold">
        <Sparkles size={14} className="shrink-0" />
        מחקר AI מתבצע…
      </div>
      <div className="h-1.5 rounded-full bg-sc-light-blue overflow-hidden">
        <motion.div
          className="h-full w-1/3 rounded-full bg-sc-primary"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </motion.div>
  )
}
