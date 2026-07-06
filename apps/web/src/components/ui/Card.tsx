import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-sc-border rounded-sc-card shadow-sc-card ${className}`}>
      {children}
    </div>
  )
}

export function CardBody({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`p-5 ${className}`}>{children}</div>
}

export function CardHeader({
  title,
  meta,
  className = '',
}: {
  title: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex justify-between items-baseline px-5 pt-5 pb-3 ${className}`}>
      <h3 className="text-[16px] font-bold m-0">{title}</h3>
      {meta && <div className="text-[12px] text-sc-text-secondary">{meta}</div>}
    </div>
  )
}
