// Admin side of the two-way system chat, embedded in a god detail modal. Shows
// the conversation with one user + a composer with a template picker. Polls for
// near-real-time. Admin messages align right (us), user messages left (them).
import { useEffect, useRef, useState } from 'react'
import { Send, MessageSquare } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { MESSAGE_TEMPLATES } from '@asset-rise/shared'

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

export function SupportChat({ userId, userName }: { userId: string; userName?: string | null }) {
  const toast = useToast()
  const utils = trpc.useContext()
  const q = trpc.god.support.thread.useQuery({ user_id: userId }, { refetchInterval: 4000, refetchOnWindowFocus: true })
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const send = trpc.god.support.send.useMutation({
    onSuccess: () => { setText(''); utils.god.support.thread.invalidate({ user_id: userId }) },
    onError: e => toast.show(e.message),
  })

  const messages = q.data?.messages ?? []
  const name = userName ?? q.data?.user.full_name ?? ''

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  function applyTemplate(id: string) {
    const t = MESSAGE_TEMPLATES.find(m => m.id === id)
    if (!t) return
    setText(t.body.replace(/\{\{name\}\}/g, name || 'שלום'))
  }

  function submit() {
    const body = text.trim()
    if (!body || send.isLoading) return
    send.mutate({ user_id: userId, body })
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* conversation */}
      <div className="rounded-sc-card border border-sc-border bg-sc-bg/40 p-2.5 max-h-[300px] overflow-y-auto overscroll-contain flex flex-col gap-2">
        {q.isLoading ? (
          <Skeleton h={80} />
        ) : messages.length === 0 ? (
          <div className="grid place-items-center text-center py-6 text-[12px] text-sc-text-muted">
            <div>
              <MessageSquare size={24} className="mx-auto mb-1 opacity-60" />
              אין הודעות עדיין — בחר תבנית או כתוב הודעה כדי לפתוח שיחה.
            </div>
          </div>
        ) : (
          messages.map(m => {
            const us = m.sender_kind === 'admin'
            return (
              <div key={m.id} className={`flex ${us ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-2xl px-3 py-1.5 ${us ? 'bg-sc-primary text-white' : 'bg-sc-card border border-sc-border text-sc-text'}`}>
                  <div className="text-[10px] opacity-70 mb-0.5">
                    {us ? (m.sender_name ? `${m.sender_name} (צוות)` : 'צוות') : (name || 'משתמש')} · {fmtTime(m.created_at)}
                  </div>
                  <div className="text-[13px] whitespace-pre-wrap break-words leading-relaxed">{m.body}</div>
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      {/* template picker */}
      <select
        onChange={e => { if (e.target.value) { applyTemplate(e.target.value); e.target.value = '' } }}
        defaultValue=""
        className="bg-sc-bg border border-sc-border rounded-sc-input py-2 px-2.5 text-[12.5px] text-sc-text outline-none focus:border-sc-primary cursor-pointer"
        aria-label="תבנית הודעה"
      >
        <option value="">בחר תבנית הודעה…</option>
        {MESSAGE_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>

      {/* composer */}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          rows={2}
          placeholder="כתוב הודעה למשתמש… (Enter לשליחה)"
          className="flex-1 bg-sc-bg border border-sc-border rounded-sc-input px-3 py-2 text-[13px] text-sc-text outline-none focus:border-sc-primary resize-none leading-relaxed"
        />
        <Button size="sm" icon={<Send size={15} />} loading={send.isLoading} disabled={!text.trim()} onClick={submit}>
          שלח
        </Button>
      </div>
    </div>
  )
}
