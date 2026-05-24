import type { ReactNode } from 'react'

export function EmptyState({
  icon, title, body, action,
}: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-6 text-sc-text-secondary">
      {icon && <div className="mx-auto mb-3 text-sc-text-muted">{icon}</div>}
      <h3 className="text-sc-text text-[15px] font-bold mt-3 mb-1.5">{title}</h3>
      {body && <p className="text-[13px] m-0 mb-4">{body}</p>}
      {action}
    </div>
  )
}
