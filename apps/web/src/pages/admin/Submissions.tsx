import { useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Pill'

const STATUS_LABEL: Record<string, string> = {
  open: 'פתוחה',
  in_progress: 'בטיפול',
  resolved: 'נסגרה',
  rejected: 'נדחתה',
}

const STATUS_PILL: Record<string, 'warning' | 'info' | 'success' | 'neutral'> = {
  open: 'warning',
  in_progress: 'info',
  resolved: 'success',
  rejected: 'neutral',
}

export default function AdminSubmissions() {
  const [status, setStatus] = useState<string>('')
  const list = trpc.submissions.listAll.useQuery({
    status: (status || undefined) as any,
    limit: 200,
  })

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>פניות פנימיות (כל הבניינים)</h1>
      </div>

      <Card className="mb-4">
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {['', 'open', 'in_progress', 'resolved', 'rejected'].map(s => (
              <button
                key={s || 'all'}
                onClick={() => setStatus(s)}
                className={`px-3 py-1 rounded-sc-pill text-[12px] font-bold border ${
                  status === s
                    ? 'bg-sc-primary text-white border-sc-primary'
                    : 'bg-white text-sc-text border-sc-border'
                }`}
              >
                {s ? STATUS_LABEL[s] : 'הכל'}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="פניות" meta={<Pill kind="info">{list.data?.length ?? 0}</Pill>} />
        <CardBody>
          {list.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : !list.data?.length ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">אין פניות</div>
          ) : (
            <div className="space-y-2">
              {list.data.map((r: any) => (
                <div
                  key={r.id}
                  className="p-3 rounded-sc-input border border-sc-border bg-white"
                >
                  <div className="flex items-baseline gap-2">
                    <div className="font-semibold text-[14px]">{r.title}</div>
                    <div className="flex-1" />
                    <Pill kind={STATUS_PILL[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                  </div>
                  {r.body && (
                    <div className="text-[12px] text-sc-text-secondary mt-1 line-clamp-2">{r.body}</div>
                  )}
                  <div className="text-[11px] text-sc-text-muted mt-1">
                    {r.submitter?.full_name ?? '—'}
                    {' · '}
                    {r.building?.address ?? r.building_id}
                    {r.building?.city && ` · ${r.building.city}`}
                    {' · '}
                    {new Date(r.created_at).toLocaleString('he-IL')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
