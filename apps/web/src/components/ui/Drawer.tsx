// Right-side detail drawer (slides from the inline-end = left edge in RTL).
// Used for entity detail panels (report / user / log). Esc + overlay close.
import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 480,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children?: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            className="fixed inset-y-0 left-0 z-50 bg-sc-card border-l border-sc-border shadow-sc-xl flex flex-col max-w-[92vw]"
            style={{ width }}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            role="dialog"
            aria-modal
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-sc-border">
              <h2 className="text-[16px] font-bold text-sc-text m-0">{title}</h2>
              <button
                onClick={onClose}
                aria-label="סגור"
                className="text-sc-text-muted hover:text-sc-text"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
