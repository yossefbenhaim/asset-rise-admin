// The waiting queue: pending jobs that haven't started yet, oldest first
// (next to run at the top). Compact list with position number + age. Calm
// empty state when the queue is clear.
import { motion } from 'framer-motion'
import { Hourglass, ListChecks } from 'lucide-react'
import type { ProcessingJob } from '@asset-rise/shared'
import { EmptyState } from '@/components/ui/EmptyState'
import { timeAgo } from '@/lib/format'

export function QueuePanel({ jobs, index = 0 }: { jobs: ProcessingJob[]; index?: number }) {
  return (
    <motion.div
      className="sc-glass p-4 flex flex-col gap-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-sc-text m-0 inline-flex items-center gap-1.5">
          <Hourglass size={15} className="text-sc-navy" />
          תור המתנה
        </h3>
        <span className="text-[12px] font-semibold text-sc-text-secondary sc-num">{jobs.length}</span>
      </div>

      {jobs.length === 0 ? (
        <EmptyState icon={<ListChecks size={26} />} title="התור ריק" body="אין עבודות שממתינות לעיבוד כרגע." />
      ) : (
        <ul className="flex flex-col divide-y divide-sc-border/60 -mb-1">
          {jobs.map((j, i) => (
            <li key={j.id} className="flex items-center gap-3 py-2">
              <span className="grid place-items-center w-6 h-6 rounded-full bg-sc-bg text-sc-text-secondary text-[11px] font-bold shrink-0 sc-num">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold text-sc-text truncate" title={j.label}>
                  {j.label}
                </div>
                <div className="text-[11px] text-sc-text-muted truncate">
                  {j.city ? `${j.city} · ` : ''}נוסף {timeAgo(j.created_at)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}
