import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Pill'

const STAGE_LABEL: Record<string, string> = {
  REGISTRATION: 'הרשמה',
  REP_ELECTION: 'בחירת ועד',
  BATON_TO_REP: 'מעבר שרביט',
  SELECT_ORGANIZER: 'בחירת מארגן',
  SELECT_LAWYER: 'בחירת עו״ד',
  OPEN_TENDERS: 'מכרזים',
  APPRAISER_ARCHITECT: 'שמאי + אדריכל',
  SELECT_DEVELOPER: 'בחירת יזם',
  SECOND_APPRAISAL: 'שמאות שנייה',
  DEADLINES_REVIEW: 'בדיקת לו״ז',
  PERMITS: 'היתרים',
  EVACUATION: 'פינוי',
  CONSTRUCTION: 'בנייה',
  DELIVERY: 'מסירה',
}

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
          ) : list.error ? (
            <div className="text-center py-6 text-sc-danger text-[13px]">{list.error.message}</div>
          ) : !list.data?.length ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">אין בניינים</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-right text-sc-text-secondary border-b border-sc-border">
                    <th className="py-2 px-2">עיר</th>
                    <th className="py-2 px-2">כתובת</th>
                    <th className="py-2 px-2">דיירים</th>
                    <th className="py-2 px-2">פרויקט / שלב</th>
                    <th className="py-2 px-2">קוד הזמנה</th>
                    <th className="py-2 px-2">נוצר</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((b: any) => (
                    <tr key={b.id} className="border-b border-sc-border/40">
                      <td className="py-2 px-2 font-semibold">{b.city ?? '—'}</td>
                      <td className="py-2 px-2">{b.address || '—'}</td>
                      <td className="py-2 px-2">{b.tenant_count}</td>
                      <td className="py-2 px-2">
                        {b.project ? (
                          <Pill kind="success">
                            {STAGE_LABEL[b.project.current_stage] ?? b.project.current_stage ?? 'פעיל'}
                          </Pill>
                        ) : (
                          <Pill kind="neutral">לא נפתח</Pill>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <code className="text-[11px] bg-sc-bg px-1 rounded">{b.invite_code ?? '—'}</code>
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
