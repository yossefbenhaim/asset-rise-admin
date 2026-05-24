import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({
  open, title, children, footer, onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}) {
  // Esc closes
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="sc-modal-bg" onClick={onClose}>
      <div className="sc-modal" onClick={e => e.stopPropagation()}>
        <div className="sc-modal__head">
          <h3>{title}</h3>
          <button className="sc-modal__close" onClick={onClose} aria-label="סגור"><X size={18} /></button>
        </div>
        <div className="sc-modal__body">{children}</div>
        {footer && <div className="sc-modal__foot">{footer}</div>}
      </div>
    </div>
  )
}
