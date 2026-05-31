import { useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { DangerConfirm } from '@/components/ui/DangerConfirm'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { MessagesSquare, MessageSquare, Trash2, RotateCcw, UserCog } from 'lucide-react'
import type {
  GodChatBuilding,
  GodChatThread,
  GodChatMessage,
} from '@asset-rise/shared/schemas/godChat'

// God-mode "Chat Moderation" page (Wave 3 — content + comms). Pick a building
// from the room list (every building with a chat thread + message / deleted
// counts), view its FULL sc_chat_messages thread including soft-deleted rows,
// and run the audited god writes:
//   deleteMessage  — SOFT delete (set deleted_at; DangerConfirm)
//   restoreMessage — un-soft-delete (set deleted_at = null)
//
// The god.chat router is an isolated sibling that the integration step merges
// into the god router; until that lands its procedures aren't on the typed tRPC
// client, so this page reaches them through a thin typed accessor. All call
// sites stay strongly typed against the shared schema interfaces.
type MutOpts = { onSuccess?: () => void; onError?: (e: { message: string }) => void }
type Mut<TInput> = { mutate: (input: TInput) => void; isLoading: boolean }

const god = trpc as unknown as {
  god: {
    chat: {
      buildings: {
        useQuery: () => {
          data?: GodChatBuilding[]
          isLoading: boolean
          isError: boolean
          error: { message: string } | null
        }
        invalidate: () => Promise<void>
      }
      thread: {
        useQuery: (
          input: { building_id: string; limit?: number },
          opts?: { enabled?: boolean; keepPreviousData?: boolean },
        ) => {
          data?: GodChatThread
          isLoading: boolean
          isError: boolean
          error: { message: string } | null
        }
        invalidate: (input: { building_id: string }) => Promise<void>
      }
      deleteMessage: { useMutation: (o: MutOpts) => Mut<{ id: string; confirm: string }> }
      restoreMessage: { useMutation: (o: MutOpts) => Mut<{ id: string }> }
    }
  }
}

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[13px]'

function fmtTime(s: string | null | undefined): string {
  if (!s) return ''
  return new Date(s).toLocaleString('he-IL')
}

export default function GodChat() {
  const [activeBuilding, setActiveBuilding] = useState<GodChatBuilding | null>(null)
  const [q, setQ] = useState('')

  const buildings = god.god.chat.buildings.useQuery()

  const safe = q.trim().toLowerCase()
  const rooms = (buildings.data ?? []).filter(b =>
    !safe ||
    [b.address, b.city].filter(Boolean).join(' ').toLowerCase().includes(safe),
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>צ׳אט בניינים — מנהל-על</h1>
      </div>

      <ControlPanel
        title="ניהול וצנזורה של צ׳אט"
        description="צפייה בשרשור ההודעות המלא של כל בניין (כולל הודעות שנמחקו), מחיקה רכה (soft-delete) של הודעה פוגענית ושחזורה. מחיקה רכה אינה מוחקת את ההודעה ממסד הנתונים — היא מסומנת כ«נמחקה» ומוסתרת מהדיירים. כל פעולה נרשמת ביומן הביקורת."
        tone="danger"
      >
        <input
          className={inputCls}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="חיפוש בניין לפי כתובת / עיר…"
        />
      </ControlPanel>

      <Card className="mt-4">
        <CardHeader
          title="חדרי צ׳אט"
          meta={<Pill kind="info">{rooms.length}</Pill>}
        />
        <CardBody>
          {buildings.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : buildings.isError ? (
            <div className="text-center py-6 text-sc-danger text-[13px]">{buildings.error?.message}</div>
          ) : !rooms.length ? (
            <EmptyState
              icon={<MessagesSquare size={28} />}
              title="אין חדרי צ׳אט"
              body="לא נמצאו בניינים עם שרשור צ׳אט התואמים את החיפוש."
            />
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>בניין</th>
                    <th>עיר</th>
                    <th>הודעות</th>
                    <th>נמחקו</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.map(b => (
                    <tr key={b.thread_id}>
                      <td className="font-semibold">{b.address ?? '—'}</td>
                      <td className="text-[12px]">{b.city ?? '—'}</td>
                      <td>{b.message_count}</td>
                      <td>
                        {b.deleted_count > 0 ? (
                          <Pill kind="danger">{b.deleted_count}</Pill>
                        ) : (
                          <span className="text-sc-text-muted">0</span>
                        )}
                      </td>
                      <td>
                        <Button size="sm" variant="ghost" onClick={() => setActiveBuilding(b)}>
                          פתח שרשור
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {activeBuilding && (
        <ChatThread building={activeBuilding} onClose={() => setActiveBuilding(null)} />
      )}
    </div>
  )
}

function ChatThread({ building, onClose }: { building: GodChatBuilding; onClose: () => void }) {
  const thread = god.god.chat.thread.useQuery(
    { building_id: building.building_id, limit: 1000 },
    { keepPreviousData: true },
  )

  return (
    <Card className="mt-4 border-s-4 border-sc-navy">
      <CardHeader
        title={`שרשור צ׳אט · ${building.address ?? building.building_id}`}
        meta={
          <div className="flex items-center gap-2">
            <Pill kind="info">{thread.data?.message_count ?? building.message_count} הודעות</Pill>
            {(thread.data?.deleted_count ?? building.deleted_count) > 0 && (
              <Pill kind="danger">{thread.data?.deleted_count ?? building.deleted_count} נמחקו</Pill>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>סגור</Button>
          </div>
        }
      />
      <CardBody>
        {thread.isLoading ? (
          <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
        ) : thread.isError ? (
          <div className="text-center py-6 text-sc-danger text-[13px]">{thread.error?.message}</div>
        ) : !thread.data?.messages.length ? (
          <EmptyState
            icon={<MessageSquare size={28} />}
            title="אין הודעות"
            body="בשרשור הצ׳אט של בניין זה אין הודעות עדיין."
          />
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {thread.data.messages.map(m => (
              <MessageRow key={m.id} m={m} building={building} />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function MessageRow({ m, building }: { m: GodChatMessage; building: GodChatBuilding }) {
  const toast = useToast()
  const [deleteOpen, setDeleteOpen] = useState(false)

  function refresh() {
    void god.god.chat.thread.invalidate({ building_id: building.building_id })
    void god.god.chat.buildings.invalidate()
  }

  const deleteM = god.god.chat.deleteMessage.useMutation({
    onSuccess: () => { toast.show('ההודעה נמחקה (מחיקה רכה)'); setDeleteOpen(false); refresh() },
    onError: e => toast.show(e.message),
  })
  const restoreM = god.god.chat.restoreMessage.useMutation({
    onSuccess: () => { toast.show('ההודעה שוחזרה'); refresh() },
    onError: e => toast.show(e.message),
  })

  const sender = m.sender_name || m.sender_email || (m.sender_id ? '(לא ידוע)' : 'מערכת')
  // The DangerConfirm token: a short, stable label the moderator must re-type.
  const confirmToken = m.id.slice(0, 8)

  return (
    <>
      <div
        className={`rounded-sc-input border p-3 ${
          m.is_deleted ? 'border-sc-danger bg-sc-danger-bg/30' : 'border-sc-border'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-semibold text-[12px]">{sender}</span>
              {m.created_at && (
                <span className="text-[11px] text-sc-text-muted">{fmtTime(m.created_at)}</span>
              )}
              {m.edited_at && <Pill kind="neutral">נערך</Pill>}
              {m.is_deleted && <Pill kind="danger">נמחקה</Pill>}
            </div>
            {m.acted_by_name && (
              <div className="flex items-center gap-1 text-[11px] text-sc-text-muted mt-0.5">
                <UserCog size={12} /> בוצע ע״י {m.acted_by_name} (בן/בת משפחה)
              </div>
            )}
            <div
              className={`text-[13px] whitespace-pre-wrap break-words mt-1 ${
                m.is_deleted ? 'line-through text-sc-text-muted' : ''
              }`}
            >
              {m.body || '—'}
            </div>
          </div>
          <div className="shrink-0">
            {m.is_deleted ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw size={14} />}
                loading={restoreM.isLoading}
                onClick={() => restoreM.mutate({ id: m.id })}
              >שחזר</Button>
            ) : (
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={14} />}
                onClick={() => setDeleteOpen(true)}
              >מחק</Button>
            )}
          </div>
        </div>
      </div>

      <DangerConfirm
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="מחיקת הודעת צ׳אט"
        confirmText={confirmToken}
        confirmLabel="מחק הודעה"
        loading={deleteM.isLoading}
        onConfirm={() => deleteM.mutate({ id: m.id, confirm: confirmToken })}
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0">פעולה הרסנית!</p>
            <p className="m-0">
              מחיקה רכה תסתיר את ההודעה מכל הדיירים בשרשור (היא תוצג כ«הודעה נמחקה»).
              תוכן ההודעה נשמר במסד הנתונים וניתן לשחזר אותה בכל עת.
            </p>
            <p className="m-0 text-sc-text-secondary">
              מאת: {sender} · {fmtTime(m.created_at)}
            </p>
          </div>
        }
      />
    </>
  )
}
