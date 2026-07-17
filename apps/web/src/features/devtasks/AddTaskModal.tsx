// Add-task modal — a new card enters the factory at the backlog column. The
// richer fields (system area, target user, acceptance criteria, do-not-break,
// size, dependencies) all flow into the agent brief, so the more you fill in the
// less the factory has to guess.
import { useMemo, useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { PHASE_LABEL, TYPE_LABEL, SIZE_LABEL, PERSONA_OPTIONS, PRIORITY_LABEL } from './meta'

const inp =
  'mt-1 w-full bg-sc-bg border border-sc-border rounded-sc-input px-2 py-2 text-[13px] text-sc-text'
const lbl = 'text-[12px] font-bold text-sc-text-secondary'

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
  const empty = {
    title: '',
    description: '',
    phase: 'quickwin',
    task_type: 'dev',
    system_area: '',
    user_persona: '',
    acceptance_criteria: '',
    do_not_break: '',
    size: '',
    reference_links: '',
    priority: '2',
  }
  const [form, setForm] = useState(empty)
  const [deps, setDeps] = useState<number[]>([])

  const all = trpc.devTasks.list.useQuery(undefined, { enabled: open, staleTime: 30_000 })
  const tasks = useMemo(() => all.data ?? [], [all.data])

  const create = trpc.devTasks.create.useMutation({
    onSuccess: () => {
      toast.show('נוספה ללוח')
      setForm(empty)
      setDeps([])
      onClose()
      onDone()
    },
    onError: e => toast.show(e.message || 'הוספה נכשלה'),
  })

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }))
  const opt = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined)

  return (
    <Modal open={open} onClose={onClose} title="משימה חדשה">
      <div className="grid gap-3 md:grid-cols-2">
        <label className={`${lbl} md:col-span-2`}>
          כותרת המשימה (חובה)
          <input className={inp} value={form.title} onChange={set('title')} />
        </label>

        <label className={lbl}>
          חלק במערכת · לאן זה מתחבר (חובה)
          <input
            className={inp}
            placeholder="לדוגמה: מנוע המארגן / החתמות · תשלומים · צ׳אט בניין"
            value={form.system_area}
            onChange={set('system_area')}
          />
        </label>
        <label className={lbl}>
          סוג משתמש · למי הפיצר / איך לבדוק (חובה)
          <select className={inp} value={form.user_persona} onChange={set('user_persona')}>
            <option value="">— בחר —</option>
            {PERSONA_OPTIONS.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className={lbl}>
          שלב בקמפיין
          <select className={inp} value={form.phase} onChange={set('phase')}>
            {Object.entries(PHASE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className={lbl}>
          סוג
          <select className={inp} value={form.task_type} onChange={set('task_type')}>
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label className={lbl}>
          גודל / מורכבות
          <select className={inp} value={form.size} onChange={set('size')}>
            <option value="">— לא צוין —</option>
            {Object.entries(SIZE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className={lbl}>
          עדיפות עסקית
          <select className={inp} value={form.priority} onChange={set('priority')}>
            {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label className={`${lbl} md:col-span-2`}>
          תיאור מעמיק — מה בונים ולמה (חובה)
          <textarea
            className={`${inp} min-h-[90px]`}
            placeholder="הסבר מלא: מה המשימה, מה הבעיה שהיא פותרת, איך זה אמור לעבוד."
            value={form.description}
            onChange={set('description')}
          />
        </label>

        <label className={`${lbl} md:col-span-2`}>
          קריטריוני קבלה — מתי זה נחשב גמור
          <textarea
            className={`${inp} min-h-[70px]`}
            placeholder="שורה לכל תנאי. לדוגמה: מלווה רואה סטטוס החתמה לכל דייר · פילטר לפי סטטוס עובד · טסט מכסה את הזרימה."
            value={form.acceptance_criteria}
            onChange={set('acceptance_criteria')}
          />
        </label>

        <label className={`${lbl} md:col-span-2`}>
          מה אסור לשבור (גדרת הגנה)
          <textarea
            className={`${inp} min-h-[56px]`}
            placeholder="חלקים קיימים שאסור לפגוע בהם. לדוגמה: זרימת ההרשמה · בידוד פר-פרויקט · חתימות קיימות."
            value={form.do_not_break}
            onChange={set('do_not_break')}
          />
        </label>

        <label className={`${lbl} md:col-span-2`}>
          קישורי ייחוס / מסך (URL)
          <input
            className={inp}
            placeholder="קישור לעיצוב, צילום-מסך של מתחרה, מסמך ייחוס…"
            value={form.reference_links}
            onChange={set('reference_links')}
          />
        </label>

        {/* Dependencies — pick existing tickets this one waits on. */}
        <div className="md:col-span-2">
          <div className={lbl}>תלוי במשימות (בחר אם רלוונטי)</div>
          <div className="mt-1 max-h-[150px] overflow-y-auto border border-sc-border rounded-sc-input p-1.5 bg-sc-bg">
            {tasks.length === 0 && (
              <div className="text-[12px] text-sc-text-muted px-1 py-1">
                אין עדיין משימות אחרות.
              </div>
            )}
            {tasks.map(t => (
              <label
                key={t.id}
                className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-sc-card cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={deps.includes(t.seq)}
                  onChange={e =>
                    setDeps(d => (e.target.checked ? [...d, t.seq] : d.filter(x => x !== t.seq)))
                  }
                />
                <span className="text-[12px] text-sc-text truncate">
                  #{t.seq} — {t.title}
                </span>
              </label>
            ))}
          </div>
          {deps.length > 0 && (
            <div className="text-[11px] text-sc-text-muted mt-1">
              נבחרו:{' '}
              {deps
                .sort((a, b) => a - b)
                .map(s => `#${s}`)
                .join(', ')}
            </div>
          )}
        </div>
      </div>

      {(() => {
        const missing = [
          form.title.trim().length < 2 && 'כותרת',
          form.description.trim().length < 10 && 'תיאור מעמיק',
          form.system_area.trim().length < 2 && 'חלק במערכת',
          form.user_persona.trim().length < 2 && 'סוג משתמש',
        ].filter(Boolean)
        return missing.length ? (
          <div className="mt-3 text-[11.5px] text-sc-warning font-bold">
            שדות חובה חסרים: {missing.join(' · ')}
          </div>
        ) : null
      })()}

      <div className="flex justify-end gap-2 mt-4">
        <Button variant="ghost" onClick={onClose}>
          ביטול
        </Button>
        <Button
          disabled={
            form.title.trim().length < 2 ||
            form.description.trim().length < 10 ||
            form.system_area.trim().length < 2 ||
            form.user_persona.trim().length < 2 ||
            create.isLoading
          }
          onClick={() =>
            create.mutate({
              title: form.title.trim(),
              description: form.description.trim(),
              system_area: form.system_area.trim(),
              user_persona: form.user_persona.trim(),
              phase: form.phase as never,
              task_type: form.task_type as never,
              agent: 'Jarvis',
              depends_on: deps.length ? deps : undefined,
              priority: Number(form.priority),
              acceptance_criteria: opt(form.acceptance_criteria),
              do_not_break: opt(form.do_not_break),
              size: (opt(form.size) as 'S' | 'M' | 'L' | undefined) ?? undefined,
              reference_links: opt(form.reference_links),
            })
          }
        >
          {create.isLoading ? 'מוסיף…' : 'הוסף'}
        </Button>
      </div>
    </Modal>
  )
}
