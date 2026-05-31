import { useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody } from '@/components/ui/Card'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ScrollText } from 'lucide-react'
import type { GodAuditListInput } from '@asset-rise/shared'

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[13px]'

// Read-only audit log viewer. The DB trigger (migration 007) makes the
// underlying table append-only, so this surface is read-only by design.
export default function AdminAudit() {
  // Draft holds the live form state; `filters` is what we actually query.
  const [draft, setDraft] = useState({
    actor_id: '',
    action: '',
    target_type: '',
    target_id: '',
    from: '',
    to: '',
  })
  const [filters, setFilters] = useState<GodAuditListInput>({ limit: 200 })

  const list = trpc.god.auditList.useQuery(filters, { keepPreviousData: true })

  function apply() {
    const next: GodAuditListInput = { limit: 200 }
    if (draft.actor_id.trim()) next.actor_id = draft.actor_id.trim()
    if (draft.action.trim()) next.action = draft.action.trim()
    if (draft.target_type.trim()) next.target_type = draft.target_type.trim()
    if (draft.target_id.trim()) next.target_id = draft.target_id.trim()
    // datetime-local -> ISO so it satisfies z.string().datetime().
    if (draft.from) next.from = new Date(draft.from).toISOString()
    if (draft.to) next.to = new Date(draft.to).toISOString()
    setFilters(next)
  }

  function reset() {
    setDraft({ actor_id: '', action: '', target_type: '', target_id: '', from: '', to: '' })
    setFilters({ limit: 200 })
  }

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>יומן ביקורת</h1>
      </div>

      <ControlPanel
        title="יומן ביקורת — לקריאה בלבד"
        description="היומן הוא append-only ברמת מסד הנתונים. לא ניתן לערוך או למחוק רשומות."
        tone="navy"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <label className="block">
            <span className="text-[12px] text-sc-text-secondary mb-1 block">מבצע (UUID)</span>
            <input
              className={inputCls}
              value={draft.actor_id}
              onChange={e => setDraft({ ...draft, actor_id: e.target.value })}
              placeholder="actor_id"
            />
          </label>
          <label className="block">
            <span className="text-[12px] text-sc-text-secondary mb-1 block">פעולה (מכיל)</span>
            <input
              className={inputCls}
              value={draft.action}
              onChange={e => setDraft({ ...draft, action: e.target.value })}
              placeholder="lead.update / god."
            />
          </label>
          <label className="block">
            <span className="text-[12px] text-sc-text-secondary mb-1 block">סוג יעד</span>
            <input
              className={inputCls}
              value={draft.target_type}
              onChange={e => setDraft({ ...draft, target_type: e.target.value })}
              placeholder="lead / user"
            />
          </label>
          <label className="block">
            <span className="text-[12px] text-sc-text-secondary mb-1 block">מזהה יעד</span>
            <input
              className={inputCls}
              value={draft.target_id}
              onChange={e => setDraft({ ...draft, target_id: e.target.value })}
              placeholder="target_id"
            />
          </label>
          <label className="block">
            <span className="text-[12px] text-sc-text-secondary mb-1 block">מתאריך</span>
            <input
              type="datetime-local"
              className={inputCls}
              value={draft.from}
              onChange={e => setDraft({ ...draft, from: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-[12px] text-sc-text-secondary mb-1 block">עד תאריך</span>
            <input
              type="datetime-local"
              className={inputCls}
              value={draft.to}
              onChange={e => setDraft({ ...draft, to: e.target.value })}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={apply}>סנן</Button>
          <Button size="sm" variant="ghost" onClick={reset}>נקה</Button>
        </div>
      </ControlPanel>

      <Card className="mt-4">
        <CardBody>
          {list.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : list.isError ? (
            <div className="text-center py-6 text-sc-danger text-[13px]">{list.error.message}</div>
          ) : !list.data?.length ? (
            <EmptyState icon={<ScrollText size={28} />} title="אין רשומות ביומן" body="לא נמצאו רשומות התואמות את הסינון." />
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>תאריך</th>
                    <th>מבצע</th>
                    <th>פעולה</th>
                    <th>יעד</th>
                    <th>IP</th>
                    <th>מטא</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map(r => (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleString('he-IL')}</td>
                      <td>
                        {r.actor_email
                          ? r.actor_email
                          : r.actor_id
                            ? <span className="text-sc-text-muted">{r.actor_id.slice(0, 8)}…</span>
                            : <span className="text-sc-text-muted">מערכת</span>}
                      </td>
                      <td><Pill kind="info">{r.action}</Pill></td>
                      <td className="text-[12px]">
                        {r.target_type
                          ? <>{r.target_type}{r.target_id ? <span className="text-sc-text-muted"> · {r.target_id.slice(0, 12)}…</span> : null}</>
                          : <span className="text-sc-text-muted">—</span>}
                      </td>
                      <td className="text-[12px] text-sc-text-secondary">{r.ip ?? '—'}</td>
                      <td>
                        {r.meta
                          ? <code className="text-[11px] break-all">{JSON.stringify(r.meta)}</code>
                          : <span className="text-sc-text-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
