// Dashboard "דוחות שסומנו" card — the current admin's pinned reports surfaced
// at the top of the control center. Reuses reports.listFlagged (per-admin), the
// shared score tones, and the glass card / framer-motion entrance used across
// the dashboard. Each row links to /reports for triage. Empty + loading states
// match the rest of the dashboard.
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Pin, ChevronLeft, StickyNote } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { scoreTone } from '@/features/reports/scoreColor'
import { timeAgo } from '@/lib/format'

function ScoreChip({ score }: { score: number | null }) {
  const tone = scoreTone(score)
  return (
    <span
      className={`grid place-items-center w-9 h-9 shrink-0 rounded-full text-[13px] font-extrabold sc-num ${tone.bg} ${tone.text}`}
      title="ציון היתכנות"
    >
      {tone.label}
    </span>
  )
}

function PinnedSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-1">
          <Skeleton h={36} w={36} rounded="999px" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton h={13} w="55%" />
            <Skeleton h={10} w="35%" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PinnedReports({ index = 0 }: { index?: number }) {
  const q = trpc.reports.listFlagged.useQuery(undefined, { refetchOnWindowFocus: false })
  const rows = q.data ?? []

  return (
    <motion.div
      className="sc-glass p-4 flex flex-col gap-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-sc-text m-0 inline-flex items-center gap-1.5">
          <Pin size={15} className="text-sc-primary" />
          דוחות שסומנו
        </h3>
        <Link
          to="/reports"
          className="text-[12px] font-semibold text-sc-primary inline-flex items-center gap-0.5 hover:underline"
        >
          כל הדוחות <ChevronLeft size={14} />
        </Link>
      </div>

      {q.isLoading ? (
        <PinnedSkeleton />
      ) : q.isError ? (
        <EmptyState
          icon={<Pin size={26} />}
          title="לא ניתן לטעון את הדוחות המסומנים"
          body={q.error?.message ?? undefined}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Pin size={26} />}
          title="לא סימנת דוחות"
          body="ניתן לסמן דוחות חשובים מתוך עמוד הדוחות כדי שיופיעו כאן."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-sc-border/60 -mb-1">
          {rows.map((r) => (
            <li key={r.token}>
              <Link
                to="/reports"
                className="group flex items-center gap-3 py-2.5 rounded-sc-input -mx-1 px-1 hover:bg-sc-navy/5 transition-colors"
              >
                <ScoreChip score={r.score} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-sc-text truncate">
                    {r.address_display ?? 'כתובת לא ידועה'}
                  </div>
                  <div className="text-[11px] text-sc-text-muted truncate">
                    {r.lead_name ? `${r.lead_name} · ` : ''}סומן {timeAgo(r.updated_at)}
                  </div>
                  {r.note && (
                    <div className="mt-1 inline-flex items-start gap-1 text-[11.5px] text-sc-text-secondary max-w-full">
                      <StickyNote size={12} className="mt-0.5 shrink-0 text-sc-gold" />
                      <span className="line-clamp-1">{r.note}</span>
                    </div>
                  )}
                </div>
                <ChevronLeft
                  size={16}
                  className="shrink-0 text-sc-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}
