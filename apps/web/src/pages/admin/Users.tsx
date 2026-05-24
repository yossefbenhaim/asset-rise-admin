import { useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useRoleKeys } from '@/lib/auth/session'

const ROLE_LABEL: Record<string, string> = {
  tenant: 'דייר',
  provider: 'ספק',
  admin: 'מנהל',
}

export default function AdminUsers() {
  const [role, setRole] = useState<'tenant' | 'provider' | 'admin' | ''>('')
  const [q, setQ] = useState('')
  const roleKeys = useRoleKeys()
  const isAdmin = roleKeys.includes('admin')
  const toast = useToast()
  const utils = trpc.useContext()

  const list = trpc.users.list.useQuery({
    role: role || undefined,
    q: q || undefined,
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

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>משתמשים</h1>
      </div>

      <Card className="mb-4">
        <CardBody>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={role}
              onChange={e => setRole(e.target.value as any)}
              className="border border-sc-border rounded-sc-input p-2 text-[13px]"
            >
              <option value="">כל התפקידים</option>
              <option value="tenant">דייר</option>
              <option value="provider">ספק</option>
              <option value="admin">מנהל</option>
            </select>
            <input
              type="text"
              placeholder="חיפוש לפי שם / אימייל / טלפון"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="flex-1 min-w-[200px] border border-sc-border rounded-sc-input p-2 text-[13px]"
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="רשימה" meta={<Pill kind="info">{list.data?.length ?? 0}</Pill>} />
        <CardBody>
          {list.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : !list.data?.length ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">לא נמצאו תוצאות</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-right text-sc-text-secondary border-b border-sc-border">
                    <th className="py-2 px-2">שם</th>
                    <th className="py-2 px-2">אימייל</th>
                    <th className="py-2 px-2">טלפון</th>
                    <th className="py-2 px-2">תפקיד</th>
                    <th className="py-2 px-2">נוצר</th>
                    {isAdmin && <th className="py-2 px-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((u: any) => (
                    <tr key={u.id} className="border-b border-sc-border/40">
                      <td className="py-2 px-2 font-semibold">{u.full_name}</td>
                      <td className="py-2 px-2">{u.email}</td>
                      <td className="py-2 px-2">{u.phone ?? '—'}</td>
                      <td className="py-2 px-2">
                        <Pill kind={u.role === 'admin' ? 'gold' : u.role === 'provider' ? 'navy' : 'info'}>
                          {ROLE_LABEL[u.role] ?? u.role}
                          {u.provider_type ? ` · ${u.provider_type}` : ''}
                        </Pill>
                      </td>
                      <td className="py-2 px-2 text-sc-text-secondary">
                        {new Date(u.created_at).toLocaleDateString('he-IL')}
                      </td>
                      {isAdmin && (
                        <td className="py-2 px-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="secondary" onClick={() => setSelected(u.id)}>פרטים</Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={disable.isLoading}
                              onClick={() => {
                                if (confirm('להשבית את המשתמש?')) {
                                  disable.mutate({ user_id: u.id, banned: true })
                                }
                              }}
                            >השבת</Button>
                            <Button
                              size="sm"
                              variant="danger"
                              loading={del.isLoading}
                              onClick={() => {
                                if (confirm('למחוק לצמיתות? פעולה לא הפיכה.')) {
                                  del.mutate(u.id)
                                }
                              }}
                            >מחק</Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

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
