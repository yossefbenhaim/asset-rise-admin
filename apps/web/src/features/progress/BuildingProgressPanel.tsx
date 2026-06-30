import { AlertTriangle, Crown, MessageCircle } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { ProgressStrip } from './ProgressStrip'

// Per-building progress: the project's 14-stage standing + who holds the baton.
// onOpenChat (Phase 2) messages the baton holder.
export function BuildingProgressPanel({
  buildingId, onOpenChat,
}: { buildingId: string; onOpenChat?: (userId: string, name: string | null) => void }) {
  const q = trpc.god.progress.building.useQuery({ building_id: buildingId }, { refetchOnWindowFocus: false })
  const d = q.data

  if (q.isLoading) return <div className="space-y-2"><Skeleton h={40} /><Skeleton h={70} /></div>
  if (q.isError || !d) return <EmptyState title="לא ניתן לטעון התקדמות" body={q.error?.message} />
  if (!d.project_id) return <EmptyState title="אין פרויקט פעיל" body="טרם נפתח פרויקט לבניין זה." />

  return (
    <div className="flex flex-col gap-3.5">
      <ProgressStrip stages={d.stages} currentStageLabel={d.current_stage_label} daysAtStage={d.days_at_stage} />

      <div className="flex items-center gap-2 flex-wrap text-[12px]">
        <Pill kind="info">{d.totals.done}/{d.totals.total} משימות</Pill>
        {d.totals.open > 0 && <Pill kind="neutral">{d.totals.open} פתוחות</Pill>}
        {d.totals.stuck > 0 && (
          <span className="inline-flex items-center gap-1 text-sc-danger font-bold">
            <AlertTriangle size={14} />{d.totals.stuck} תקועות
          </span>
        )}
      </div>

      {/* Baton holder */}
      {d.baton && (
        <div className="flex items-center justify-between gap-2 rounded-sc-input bg-sc-light-blue/50 px-3 py-2">
          <span className="inline-flex items-center gap-2 text-[12.5px] min-w-0">
            <Crown size={15} className="text-sc-gold shrink-0" />
            <span className="text-sc-text-muted">מחזיק/ת בשרביט:</span>
            <span className="font-bold text-sc-text truncate">{d.baton.full_name ?? d.baton.email ?? '—'}</span>
            <Pill kind="gold">{d.baton.role}</Pill>
          </span>
          {onOpenChat && (
            <Button size="sm" variant="ghost" icon={<MessageCircle size={14} />} onClick={() => onOpenChat(d.baton!.id, d.baton!.full_name)} className="shrink-0">
              הודעה
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
