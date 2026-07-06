// Loading state for the dashboard: mirrors the real grid layout so the page
// doesn't jump when data arrives.
import { SkeletonCard, Skeleton } from '@/components/ui/Skeleton'

function ChartSkel() {
  return (
    <div className="sc-glass p-4 flex flex-col gap-3" aria-hidden>
      <Skeleton h={13} w="35%" />
      <Skeleton h={200} rounded="12px" />
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartSkel />
        <ChartSkel />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ChartSkel />
        <ChartSkel />
        <ChartSkel />
      </div>
    </div>
  )
}
