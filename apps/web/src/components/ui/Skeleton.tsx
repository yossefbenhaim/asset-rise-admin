// Loading skeletons — token-driven shimmer (.sc-skel), reduced-motion safe.
type Props = { className?: string; w?: number | string; h?: number | string; rounded?: string }

export function Skeleton({ className = '', w, h = 14, rounded = '8px' }: Props) {
  return (
    <span
      className={`sc-skel block ${className}`}
      style={{ width: w ?? '100%', height: h, borderRadius: rounded }}
      aria-hidden
    />
  )
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} h={12} w={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full" aria-hidden>
      <div className="flex gap-3 px-4 py-3 border-b border-sc-border">
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} h={11} w={`${100 / cols}%`} />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 px-4 py-3.5 border-b border-sc-border/60">
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} h={13} w={`${100 / cols}%`} />)}
        </div>
      ))}
    </div>
  )
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`sc-card p-4 flex flex-col gap-3 ${className}`} aria-hidden>
      <Skeleton h={11} w="40%" />
      <Skeleton h={28} w="60%" />
      <Skeleton h={10} w="30%" />
    </div>
  )
}
