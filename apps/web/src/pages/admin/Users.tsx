import { useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { trpc } from '@/lib/api/trpc'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DataTable } from '@/components/ui/DataTable'
import { useToast } from '@/components/ui/Toast'
import { useRoleKeys } from '@/lib/auth/session'
import { dateShort } from '@/lib/format'

type Row = Record<string, unknown>

const ROLE_LABEL: Record<string, string> = {
  tenant: 'דייר',
  provider: 'ספק',
  admin: 'מנהל',
}

export default function AdminUsers() {
  const [role, setRole] = useState<'tenant' | 'provider' | 'admin' | ''>('')
  const roleKeys = useRoleKeys()
  const isAdmin = roleKeys.includes('admin')
  const toast = useToast()
  const utils = trpc.useContext()

  const list = trpc.users.list.useQuery({
    role: role || undefined,
    limit: 200,
  })

  const [selected, setSelected] = useState<string | null>(null)

  const disable = trpc.users.disable.useMutation({
    onSuccess: () => { toast.show('הפעולה בוצעה'); void utils.users.list.invalidate() },
    onError: e => toast.show(e.message),
  })
  const del = trpc.users.delete.useMutation({
    onSuccess: () => { toast.show('המשתמש נמחק'); void utils.users.list.invalidate() },
    onError: e => toast.show(e.message),
  })

  const columns: ColumnDef<Row, unknown>[] = [
    {
      id: 'full_name',
      header: 'שם',
      accessorFn: r => (r.full_name as string) ?? '',
      cell: ({ row }) => <span className="font-semibold">{(row.original.full_name as string) ?? '—'}</span>,
    },
    {
      id: 'email',
      header: 'אימייל',
      accessorFn: r => (r.email as string) ?? '',
      cell: ({ row }) => <span>{(row.original.email as string) ?? '—'}</span>,
    },
    {
      id: 'phone',
      header: 'טלפון',
      accessorFn: r => (r.phone as string) ?? '',
      cell: ({ row }) => <span>{(row.original.phone as string) ?? '—'}</span>,
    },
    {
      id: 'role',
      header: 'תפקיד',
      accessorFn: r => (r.role as string) ?? '',
      cell: ({ row }) => {
        const u = row.original as { role?: string; provider_type?: string }
        return (
          <Pill kind={u.role === 'admin' ? 'gold' : u.role === 'provider' ? 'navy' : 'info'}>
            {ROLE_LABEL[u.role ?? ''] ?? u.role}
            {u.provider_type ? ` · ${u.provider_type}` : ''}
          </Pill>
        )
      },
    },
    {
      id: 'created_at',
      header: 'נוצר',
      accessorFn: r => (r.created_at as string) ?? '',
      cell: ({ row }) => (
        <span className="text-sc-text-secondary sc-num">{dateShort(row.original.created_at as string)}</span>
      ),
    },
    ...(isAdmin
      ? [{
          id: 'actions',
          header: '',
          enableSorting: false,
          cell: ({ row }: { row: { original: Row } }) => {
            const id = row.original.id as string
            return (
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={disable.isLoading}
                  onClick={() => {
                    if (confirm('להשבית את המשתמש?')) {
                      disable.mutate({ user_id: id, banned: true })
                    }
                  }}
                >השבת</Button>
                <Button
                  size="sm"
                  variant="danger"
                  loading={del.isLoading}
                  onClick={() => {
                    if (confirm('למחוק לצמיתות? פעולה לא הפיכה.')) {
                      del.mutate(id)
                    }
                  }}
                >מחק</Button>
              </div>
            )
          },
        } as ColumnDef<Row, unknown>]
      : []),
  ]

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>משתמשים</h1>
      </div>

      <DataTable
        columns={columns}
        data={(list.data ?? []) as Row[]}
        loading={list.isLoading}
        onRowClick={u => setSelected(u.id as string)}
        csvName="users"
        searchPlaceholder="חיפוש משתמש…"
        emptyTitle="אין משתמשים"
        emptyBody="לא נמצאו משתמשים."
        toolbar={
          <select
            value={role}
            onChange={e => setRole(e.target.value as 'tenant' | 'provider' | 'admin' | '')}
            className="bg-sc-bg border border-sc-border rounded-sc-input p-2 text-[13px] text-sc-text outline-none focus:border-sc-primary transition-colors"
          >
            <option value="">כל התפקידים</option>
            <option value="tenant">דייר</option>
            <option value="provider">ספק</option>
            <option value="admin">מנהל</option>
          </select>
        }
      />

      {selected && <UserDetailModal userId={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function UserDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const detail = trpc.users.get.useQuery(userId)
  const u: any = detail.data
  return (
    <Modal open onClose={onClose} title="פרטי משתמש">
      {detail.isLoading || !u ? (
        <div className="text-[13px] text-sc-text-secondary">טוען…</div>
      ) : (
        <div className="space-y-2 text-[13px]">
          <Row label="שם" value={u.full_name} />
          <Row label="אימייל" value={u.email} />
          <Row label="טלפון" value={u.phone ?? '—'} />
          <Row label="תפקיד" value={`${u.role}${u.provider_type ? ' · ' + u.provider_type : ''}`} />
          <Row label="נוצר" value={new Date(u.created_at).toLocaleString('he-IL')} />
          {u.tenant_profile && (
            <>
              <Row label="בניין" value={u.tenant_profile.building_id ?? '—'} />
              <Row label="דירה" value={u.tenant_profile.apartment_number ?? '—'} />
              <Row label="ועד" value={
                [u.tenant_profile.is_committee_chair && 'יו״ר', u.tenant_profile.is_committee_member && 'חבר ועד', u.tenant_profile.is_organizer && 'מארגן']
                  .filter(Boolean).join(' · ') || '—'
              } />
            </>
          )}
          {u.admin_profile && (
            <Row label="רמות admin" value={
              [u.admin_profile.is_admin && 'admin', u.admin_profile.is_admin_support && 'support', u.admin_profile.is_admin_sales && 'sales']
                .filter(Boolean).join(' · ') || '—'
            } />
          )}
        </div>
      )}
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <div className="text-sc-text-secondary w-24">{label}</div>
      <div className="flex-1 break-all">{value}</div>
    </div>
  )
}
