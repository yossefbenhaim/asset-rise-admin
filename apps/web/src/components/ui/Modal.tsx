import { useEffect, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'

// Canonical centered dialog used for every row-click detail / form across the
// admin. Design contract:
//  • ALWAYS centered — on desktop AND mobile (no bottom-sheet); never need to
//    scroll the page to reach it.
//  • Internal scroll — the header + footer stay fixed; only the body scrolls,
//    and the scroll is contained (never chains to the page behind).
//  • Mobile-safe height via dvh, theme-aware surface, soft entrance.
const SIZES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-[440px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[760px]',
  xl: 'max-w-[960px]',
}

type ModalProps = {
  open: boolean
  title: string
  subtitle?: ReactNode
  icon?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}

export function Modal({
  open, title, subtitle, icon, size = 'md', children, footer, onClose,
}: ModalProps) {
  // Esc closes + lock the background scroll so the only scroll surface is the
  // modal body (this is what keeps the popup centered and the scroll "inside").
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <motion.div
      className="fixed inset-0 z-[80] grid place-items-center p-4 bg-[rgba(10,18,33,0.55)] backdrop-blur-[2px]"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className={`flex flex-col w-full ${SIZES[size]} max-h-[calc(100dvh-2rem)] bg-sc-card border border-sc-border rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.28)] overflow-hidden`}
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Fixed header */}
        <div className="shrink-0 flex items-start justify-between gap-3 px-6 py-4 border-b border-sc-border">
          <div className="flex items-start gap-3 min-w-0">
            {icon && (
              <span className="grid place-items-center w-9 h-9 rounded-sc-input shrink-0 bg-sc-light-blue text-sc-primary mt-0.5">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h3 className="m-0 text-[17px] font-bold text-sc-text leading-tight truncate">{title}</h3>
              {subtitle && <div className="text-[12.5px] text-sc-text-muted mt-0.5 truncate">{subtitle}</div>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="shrink-0 grid place-items-center w-8 h-8 -mt-1 -ml-1 rounded-sc-input text-sc-text-muted hover:bg-sc-bg hover:text-sc-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrolling body — the only scroll surface */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {children}
        </div>

        {/* Fixed footer */}
        {footer && (
          <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-sc-border bg-sc-card">
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
