import { useEffect, useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

// DangerConfirm — the type-the-name safety interlock for destructive god
// writes. The confirm button stays disabled until the operator types the exact
// confirmText (trimmed). Composes the existing Modal + Button; the text input
// is a raw <input> styled with tokens (there is no Field/Input component).
export function DangerConfirm({
  open,
  title,
  body,
  confirmText,
  confirmLabel = 'מחק לצמיתות',
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body?: ReactNode
  confirmText: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')

  // Reset the typed value whenever the modal (re)opens.
  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  // Require a NON-EMPTY confirm token — otherwise an empty/undefined entity
  // name would auto-enable the destructive button on an empty input.
  const target = confirmText.trim()
  const matches = target.length > 0 && typed.trim() === target

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>ביטול</Button>
          <Button
            variant="danger"
            disabled={!matches}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-[13px]">
        {body}
        <div>
          <div className="text-sc-text-secondary mb-1">
            הקלד/י «{confirmText}» לאישור
          </div>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            className="border border-sc-border rounded-sc-input p-2 w-full"
            placeholder={confirmText}
            autoFocus
          />
        </div>
      </div>
    </Modal>
  )
}
