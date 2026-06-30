import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { trpc } from '@/lib/api/trpc'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'
import type { GodAuditListInput } from '@asset-rise/shared'
import { dateTime } from '@/lib/format'

type Row = Record<string, unknown>

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
  const [active, setActive] = useState<Row | null>(null)

  const list = trpc.god.auditList.useQuery(filters, { keepPreviousData: true })

  const columns: ColumnDef<Row, unknown>[] = [
    {
      id: 'created_at',
      header: 'תאריך',
      accessorFn: r => (r.created_at as string) ?? '',
      cell: ({ row }) => (
        <span className="text-sc-text-secondary sc-num">{dateTime(row.original.created_at as string)}</span>
      ),
    },
    {
      id: 'actor',
      header: 'מבצע',
      accessorFn: r => (r.actor_email as string) ?? (r.actor_id as string) ?? '',
      cell: ({ row }) => {
        const r = row.original as { actor_email?: string; actor_id?: string }
        return r.actor_email
          ? <span>{r.actor_email}</span>
          : r.actor_id
            ? <span className="text-sc-text-muted">{r.actor_id.slice(0, 8)}…</span>
            : <span className="text-sc-text-muted">מערכת</span>
      },
    },
    {
      id: 'action',
      header: 'פעולה',
      accessorFn: r => (r.action as string) ?? '',
      cell: ({ row }) => <Pill kind="info">{row.original.action as string}</Pill>,
    },
    {
      id: 'target',
      header: 'יעד',
      accessorFn: r => (r.target_type as string) ?? '',
      cell: ({ row }) => {
        const r = row.original as { target_type?: string; target_id?: string }
        return r.target_type
          ? <span className="text-[12px]">{r.target_type}{r.target_id ? <span className="text-sc-text-muted"> · {r.target_id.slice(0, 12)}…</span> : null}</span>
          : <span className="text-sc-text-muted">—</span>
      },
    },
    {
      id: 'ip',
      header: 'IP',
      accessorFn: r => (r.ip as string) ?? '',
      cell: ({ row }) => (
        <span className="text-[12px] text-sc-text-secondary" dir="ltr">{(row.original.ip as string) ?? '—'}</span>
      ),
    },
    {
      id: 'meta',
      header: 'מטא',
      enableSorting: false,
      cell: ({ row }) =>
        row.original.meta
          ? <code className="text-[11px] break-all">{JSON.stringify(row.original.meta)}</code>
          : <span className="text-sc-text-muted">—</span>,
    },
  ]

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
        <div>
          <h1>יומן ביקורת</h1>
          <div className="sub">יומן כל פעולות-הניהול — מי עשה מה, מתי, ועל מה</div>
        </div>
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

      <div className="mt-4">
        <DataTable
          columns={columns}
          data={(list.data ?? []) as Row[]}
          loading={list.isLoading}
          onRowClick={r => setActive(r)}
          csvName="audit-log"
          searchPlaceholder="חיפוש ביומן…"
          emptyTitle="היומן ריק"
          emptyBody="לא נמצאו רשומות התואמות את הסינון."
        />
      </div>

      <Drawer open={!!active} onClose={() => setActive(null)} title="רשומת ביקורת">
        {active && (
          <div className="space-y-3 text-[13px]">
            <AuditField label="תאריך" value={dateTime(active.created_at as string)} />
            <AuditField label="מבצע (אימייל)" value={(active.actor_email as string) ?? '—'} mono={!active.actor_email} />
            <AuditField label="מבצע (UUID)" value={(active.actor_id as string) ?? 'מערכת'} mono />
            <AuditField label="פעולה" value={(active.action as string) ?? '—'} mono />
            <AuditField label="סוג יעד" value={(active.target_type as string) ?? '—'} />
            <AuditField label="מזהה יעד" value={(active.target_id as string) ?? '—'} mono />
            <AuditField label="IP" value={(active.ip as string) ?? '—'} mono />
            {active.meta ? (
              <div>
                <div className="text-sc-text-secondary mb-1">מטא / שינויים</div>
                <pre className="whitespace-pre-wrap break-all bg-sc-bg border border-sc-border rounded-sc-input p-3 text-[11px]" dir="ltr">
                  {JSON.stringify(active.meta, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        )}
      </Drawer>
    </div>
  )
}

function AuditField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <div className="text-sc-text-secondary w-28 shrink-0">{label}</div>
      <div className={`flex-1 break-all ${mono ? 'font-mono text-[12px]' : ''}`} dir={mono ? 'ltr' : undefined}>{value}</div>
    </div>
  )
}
