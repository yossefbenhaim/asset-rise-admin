// Task drawer — the full task file: rich context (the agent's brief), the
// question thread (agent asks → Yossef answers inline → factory resumes),
// per-stage work log, and manual stage/agent overrides.
import { useState } from 'react'
import {
  Trash2,
  MessageCircleQuestion,
  Send,
  ExternalLink,
  CheckCircle2,
  Undo2,
} from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Drawer } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { useToast } from '@/components/ui/Toast'
import {
  STATUS_LABEL,
  PHASE_LABEL,
  TYPE_LABEL,
  TYPE_PILL,
  SIZE_LABEL,
  PRIORITY_LABEL,
  PRIORITY_PILL,
  type DevTaskRow,
  type DevTaskQuestionRow,
} from './meta'
import { Formatted } from './Formatted'

// A labelled block that only renders when the field has content.
function Field({ label, value }: { label: string; value: string | null }) {
  if (!value || !value.trim()) return null
  return (
    <div>
      <div className="text-[12px] font-bold text-sc-text-secondary mb-0.5">{label}</div>
      <div className="text-[13px] text-sc-text leading-relaxed whitespace-pre-wrap">{value}</div>
    </div>
  )
}

const inp =
  'mt-1 w-full bg-sc-bg border border-sc-border rounded-sc-input px-2 py-2 text-[13px] text-sc-text'
const AGENTS = ['Jarvis', 'Vision', 'Hawkeye', 'Shield', 'Murdock', 'Yossef']

function QuestionCard({ q }: { q: DevTaskQuestionRow }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const [answer, setAnswer] = useState('')
  const answerMut = trpc.devTasks.answerQuestion.useMutation({
    onSuccess: () => {
      toast.show('התשובה נשלחה — הסוכן ימשיך בסבב הבא')
      utils.devTasks.questions.invalidate()
      utils.devTasks.stats.invalidate()
    },
    onError: e => toast.show(e.message || 'שליחה נכשלה'),
  })
  const open = q.status === 'open'
  return (
    <div
      className={`rounded-lg border p-3 ${open ? 'border-sc-warning bg-sc-warning/5' : 'border-sc-border bg-sc-bg'}`}
    >
      <div className="flex items-center gap-2 text-[12px]">
        <MessageCircleQuestion
          size={13}
          className={open ? 'text-sc-warning' : 'text-sc-text-muted'}
        />
        <b>{q.asked_by}</b>
        <span className="text-sc-text-muted" dir="ltr">
          {q.asked_at.slice(0, 16).replace('T', ' ')}
        </span>
        {open ? <Pill kind="warning">ממתין לתשובה</Pill> : <Pill kind="success">נענתה</Pill>}
      </div>
      <Formatted text={q.question} className="text-sc-text mt-1.5" />
      {q.answer && (
        <div className="mt-2 border-t border-sc-border pt-2">
          <b className="text-[12px] text-sc-text">התשובה שלך:</b>
          <Formatted text={q.answer} className="text-sc-text-secondary" />
        </div>
      )}
      {open && (
        <div className="mt-2 flex gap-2">
          <textarea
            className={`${inp} mt-0 min-h-[60px] flex-1`}
            placeholder="כתוב תשובה לסוכן…"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
          />
          <Button
            icon={<Send size={13} />}
            disabled={!answer.trim() || answerMut.isLoading}
            onClick={() => answerMut.mutate({ id: q.id, answer: answer.trim() })}
          >
            ענה
          </Button>
        </div>
      )}
    </div>
  )
}

export function TaskDrawer({
  task,
  questions,
  onClose,
  onSaved,
}: {
  task: DevTaskRow | null
  questions: DevTaskQuestionRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [notes, setNotes] = useState('')
  const [returnReason, setReturnReason] = useState('')
  const [loadedId, setLoadedId] = useState<string | null>(null)
  if (task && task.id !== loadedId) {
    setLoadedId(task.id)
    setNotes(task.notes ?? '')
    setReturnReason('')
  }
  const update = trpc.devTasks.update.useMutation({
    onSuccess: () => {
      toast.show('נשמר')
      onSaved()
    },
    onError: e => toast.show(e.message || 'שמירה נכשלה'),
  })
  const remove = trpc.devTasks.remove.useMutation({
    onSuccess: () => {
      toast.show('נמחק')
      onSaved()
      onClose()
    },
    onError: e => toast.show(e.message || 'מחיקה נכשלה'),
  })
  // Resolve dependency seq numbers → titles for a readable list.
  const all = trpc.devTasks.list.useQuery(undefined, { staleTime: 30_000 })
  const titleBySeq = new Map((all.data ?? []).map(x => [x.seq, x.title]))
  if (!task) return <Drawer open={false} onClose={onClose} />
  const t = task
  const taskQs = questions.filter(q => q.task_id === t.id)

  return (
    <Drawer open onClose={onClose} title={`#${t.seq} · ${t.title}`} width={620}>
      <div className="p-4 space-y-4 overflow-y-auto">
        <div className="flex items-center gap-2 flex-wrap">
          <Pill kind="neutral">{PHASE_LABEL[t.phase] ?? t.phase}</Pill>
          <Pill kind={TYPE_PILL[t.task_type] ?? 'navy'}>
            {TYPE_LABEL[t.task_type] ?? t.task_type}
          </Pill>
          <Pill kind={PRIORITY_PILL[t.priority] ?? 'neutral'}>
            {PRIORITY_LABEL[t.priority] ?? `P${t.priority}`}
          </Pill>
          {t.size && <Pill kind="neutral">{SIZE_LABEL[t.size] ?? t.size}</Pill>}
          {t.user_persona && <Pill kind="info">{t.user_persona}</Pill>}
          {t.branch && (
            <span className="text-[11px] font-mono text-sc-text-muted" dir="ltr">
              {t.branch}
            </span>
          )}
        </div>

        {t.system_area && (
          <div className="text-[12px] text-sc-text-secondary">
            <b className="text-sc-text">חלק במערכת:</b> {t.system_area}
          </div>
        )}

        {/* Dependencies resolved to #seq — title so they read at a glance. */}
        {t.depends_on.length > 0 && (
          <div className="rounded-lg border border-sc-border bg-sc-bg p-2.5">
            <div className="text-[12px] font-bold text-sc-text-secondary mb-1">תלוי במשימות</div>
            <ul className="m-0 p-0 space-y-1">
              {t.depends_on.map(n => (
                <li key={n} className="list-none text-[12.5px] text-sc-text">
                  <span className="font-mono text-sc-text-muted">#{n}</span> —{' '}
                  {titleBySeq.get(n) ?? '(משימה לא נמצאה)'}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Yossef's review stage — live preview + approve→merge or send back. */}
        {t.status === 'review' && (
          <div className="rounded-xl border-2 border-sc-gold bg-sc-gold/5 p-4 space-y-3">
            <div className="text-[14px] font-extrabold text-sc-text">
              המשימה עברה את כל שרשרת הסוכנים — תורך לבדוק
            </div>
            {t.preview_url ? (
              <a
                href={t.preview_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-bold text-sc-primary"
              >
                <ExternalLink size={14} /> פתח תצוגה מקדימה חיה של השינוי
              </a>
            ) : (
              <div className="text-[12px] font-bold text-sc-danger">
                הפיצ'ר לא אומת ב-staging — אל תאשר לפני שהוא מאוחד ומוצג (ראה הערות).
              </div>
            )}
            <Button
              icon={<CheckCircle2 size={15} />}
              disabled={update.isLoading}
              onClick={() => {
                if (confirm('לאשר? המשימה תמוזג ל-main ותיפרס לפרודקשן.'))
                  update.mutate({ id: t.id, patch: { status: 'approved' as never } })
              }}
            >
              נבדק על ידי — אשר ומזג לפרודקשן
            </Button>

            {/* Return-with-reason: ONE action captures the "why" and sends the
                card back — the factory injects this text at the top of the
                agent's next brief, so it fixes exactly what Yossef saw. */}
            <div className="border-t border-sc-border pt-3">
              <label className="text-[12px] font-bold text-sc-text-secondary block">
                לא טוב? כתוב מה שבור — וזה יגיע ישירות לסוכן:
                <textarea
                  className={`${inp} min-h-[64px]`}
                  placeholder="לדוגמה: לחצתי על הכפתור וקיבלתי שגיאה אדומה / העיצוב נשבר במובייל…"
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                />
              </label>
              <Button
                variant="ghost"
                icon={<Undo2 size={14} />}
                className="mt-2"
                disabled={returnReason.trim().length < 5 || update.isLoading}
                onClick={() => {
                  const stamp = new Date().toLocaleString('he-IL', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                  const merged =
                    `[הוחזר ע"י יוסף · ${stamp}]\n${returnReason.trim()}` +
                    (t.notes ? `\n\n${t.notes}` : '')
                  update.mutate({
                    id: t.id,
                    patch: { status: 'in_dev' as never, agent: 'Vision', notes: merged },
                  })
                  setReturnReason('')
                }}
              >
                החזר לתיקון עם ההערה
              </Button>
              {returnReason.trim().length < 5 && (
                <div className="text-[11px] text-sc-text-muted mt-1">
                  חובה לכתוב סיבה — ככה הסוכן יודע בדיוק מה לתקן.
                </div>
              )}
            </div>
          </div>
        )}

        {taskQs.length > 0 && (
          <div>
            <div className="text-[13px] font-bold text-sc-text mb-2">
              שאלות מהסוכנים ({taskQs.filter(q => q.status === 'open').length} פתוחות)
            </div>
            <div className="space-y-2">
              {taskQs.map(q => (
                <QuestionCard key={q.id} q={q} />
              ))}
            </div>
          </div>
        )}

        {t.description && (
          <div className="text-[13px] text-sc-text leading-relaxed whitespace-pre-wrap">
            {t.description}
          </div>
        )}

        <Field label="קריטריוני קבלה — מתי זה גמור" value={t.acceptance_criteria} />
        <Field label="מה אסור לשבור" value={t.do_not_break} />
        {t.reference_links && (
          <div>
            <div className="text-[12px] font-bold text-sc-text-secondary mb-0.5">
              קישורי ייחוס / מסך
            </div>
            <a
              href={t.reference_links}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[13px] text-sc-primary break-all"
            >
              <ExternalLink size={13} className="shrink-0" /> {t.reference_links}
            </a>
          </div>
        )}

        {t.token_rounds.length > 0 && (
          <div>
            <div className="text-[12px] font-bold text-sc-text-secondary mb-1">
              עלות בטוקנים · סה״כ {t.total_tokens.toLocaleString()} טוקנים
            </div>
            <div className="rounded-lg border border-sc-border bg-sc-bg divide-y divide-sc-border">
              {t.token_rounds.map(r => (
                <div
                  key={r.round}
                  className="flex items-center justify-between px-2.5 py-1.5 text-[12px]"
                >
                  <span className="text-sc-text">
                    סבב {r.round} · <b>{r.agent}</b>{' '}
                    <span className="text-sc-text-muted">({r.stage})</span>
                  </span>
                  <span className="tabular-nums text-sc-text-muted" dir="ltr">
                    {r.tokens.toLocaleString()} tok · ${r.cost_usd.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {t.context && (
          <div>
            <div className="text-[12px] font-bold text-sc-text-secondary mb-1">
              Context לסוכן (הבריף המלא)
            </div>
            <div className="bg-sc-bg border border-sc-border rounded-lg p-3 max-h-[260px] overflow-y-auto">
              <Formatted text={t.context} className="text-sc-text-secondary" />
            </div>
          </div>
        )}

        {t.work_log && (
          <div>
            <div className="text-[12px] font-bold text-sc-text-secondary mb-1">יומן עבודה</div>
            <div
              className="text-[12px] font-mono text-sc-text-secondary leading-relaxed whitespace-pre-wrap bg-sc-bg border border-sc-border rounded-lg p-3 max-h-[200px] overflow-y-auto"
              dir="ltr"
            >
              {t.work_log}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-[12px] font-bold text-sc-text-secondary">
            שלב
            <select
              className={inp}
              value={t.status}
              onChange={e =>
                update.mutate({ id: t.id, patch: { status: e.target.value as never } })
              }
            >
              {Object.entries(STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[12px] font-bold text-sc-text-secondary">
            סוכן נוכחי
            <select
              className={inp}
              value={t.agent}
              onChange={e => update.mutate({ id: t.id, patch: { agent: e.target.value } })}
            >
              {[...new Set([t.agent, ...AGENTS])].map(a => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-[12px] font-bold text-sc-text-secondary block">
          עדיפות
          <select
            className={inp}
            value={t.priority}
            onChange={e => update.mutate({ id: t.id, patch: { priority: Number(e.target.value) } })}
          >
            {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[12px] font-bold text-sc-text-secondary block">
          הערות
          <textarea
            className={`${inp} min-h-[70px]`}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </label>

        <div className="flex items-center justify-between pt-2 border-t border-sc-border">
          <button
            className="inline-flex items-center gap-1 text-[12px] text-sc-danger"
            onClick={() => {
              if (confirm(`למחוק את "${t.title}"?`)) remove.mutate({ id: t.id })
            }}
          >
            <Trash2 size={13} /> מחק משימה
          </button>
          <Button
            disabled={notes === (t.notes ?? '') || update.isLoading}
            onClick={() => update.mutate({ id: t.id, patch: { notes: notes || null } })}
          >
            {update.isLoading ? 'שומר…' : 'שמור הערות'}
          </Button>
        </div>
      </div>
    </Drawer>
  )
}
