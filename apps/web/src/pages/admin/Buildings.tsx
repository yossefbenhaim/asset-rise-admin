import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Pill'

export default function AdminBuildings() {
  const list = trpc.buildings.listAll.useQuery()

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>בניינים</h1>
      </div>

      <Card>
        <CardHeader title="כל הבניינים" meta={<Pill kind="info">{list.data?.length ?? 0}</Pill>} />
        <CardBody>
          {list.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : !list.data?.length ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">אין בניינים</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-right text-sc-text-secondary border-b border-sc-border">
                    <th className="py-2 px-2">כתובת</th>
                    <th className="py-2 px-2">עיר</th>
                    <th className="py-2 px-2">דיירים</th>
                    <th className="py-2 px-2">פרויקט</th>
                    <th className="py-2 px-2">נוצר</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((b: any) => (
                    <tr key={b.id} className="border-b border-sc-border/40">
                      <td className="py-2 px-2 font-semibold">{b.address ?? '—'}</td>
                      <td className="py-2 px-2">{b.city ?? '—'}</td>
                      <td className="py-2 px-2">{b.tenant_count}</td>
                      <td className="py-2 px-2">
                        {b.project ? (
                          <Pill kind="success">{b.project.name ?? 'פעיל'}</Pill>
                        ) : (
                          <Pill kind="neutral">אין</Pill>
                        )}
                      </td>
                      <td className="py-2 px-2 text-sc-text-secondary">
                        {new Date(b.created_at).toLocaleDateString('he-IL')}
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
