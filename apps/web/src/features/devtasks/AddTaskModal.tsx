// Add-task modal — a new card enters the factory at the backlog column.
import { useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { PHASE_LABEL, TYPE_LABEL } from './meta'

const inp =
  'mt-1 w-full bg-sc-bg border border-sc-border rounded-sc-input px-2 py-2 text-[13px] text-sc-text'

export function AddTaskModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const empty = { title: '', description: '', phase: 'quickwin', task_type: 'dev' }
  const [form, setForm] = useState(empty)
  const create = trpc.devTasks.create.useMutation({
    onSuccess: () => {
      toast.show('נוספה ללוח')
      setForm(empty)
      onClose()
      onDone()
    },
    onError: e => toast.show(e.message || 'הוספה נכשלה'),
  })
  return (
    <Modal open={open} onClose={onClose} title="משימה חדשה">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-[12px] font-bold text-sc-text-secondary md:col-span-2">
          כותרת (חובה)
          <input
            className={inp}
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary">
          שלב בקמפיין
          <select
            className={inp}
            value={form.phase}
            onChange={e => setForm(f => ({ ...f, phase: e.target.value }))}
          >
            {Object.entries(PHASE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary">
          סוג
          <select
            className={inp}
            value={form.task_type}
            onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))}
          >
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[12px] font-bold text-sc-text-secondary md:col-span-2">
          תיאור
          <textarea
            className={`${inp} min-h-[70px]`}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>
          ביטול
        </Button>
        <Button
          disabled={form.title.trim().length < 2 || create.isLoading}
          onClick={() =>
            create.mutate({
              title: form.title.trim(),
              description: form.description || undefined,
              phase: form.phase as never,
              task_type: form.task_type as never,
              agent: 'Jarvis',
            })
          }
        >
          {create.isLoading ? 'מוסיף…' : 'הוסף'}
        </Button>
      </div>
    </Modal>
  )
}
