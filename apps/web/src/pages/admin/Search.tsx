import { useState } from 'react'
import { Link } from 'react-router-dom'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody } from '@/components/ui/Card'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Pill } from '@/components/ui/Pill'
import { EmptyState } from '@/components/ui/EmptyState'
import { Search as SearchIcon } from 'lucide-react'
import type { GodSearchHitType } from '@asset-rise/shared'

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[14px]'

const TYPE_LABEL: Record<GodSearchHitType, string> = {
  user: 'משתמש',
  building: 'בניין',
  project: 'פרויקט',
  lead: 'פנייה',
}

const TYPE_PILL: Record<GodSearchHitType, 'info' | 'gold' | 'navy' | 'success'> = {
  user: 'info',
  building: 'navy',
  project: 'gold',
  lead: 'success',
}

// God-mode global search across users / buildings / projects / leads.
export default function AdminSearch() {
  const [q, setQ] = useState('')
  const trimmed = q.trim()
  const list = trpc.god.search.useQuery(
    { q: trimmed },
    { enabled: trimmed.length >= 2, keepPreviousData: true },
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>חיפוש גלובלי</h1>
      </div>

      <ControlPanel
        title="חיפוש גלובלי — מנהל-על"
        description="חיפוש חוצה-מערכת על פני משתמשים, בניינים, פרויקטים ופניות. כולל מידע אישי."
        tone="navy"
      >
        <input
          className={inputCls}
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="הקלד/י לפחות 2 תווים…"
          autoFocus
        />
      </ControlPanel>

      <Card className="mt-4">
        <CardBody>
          {trimmed.length < 2 ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">הקלד/י לפחות 2 תווים כדי לחפש.</div>
          ) : list.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : list.isError ? (
            <div className="text-center py-6 text-sc-danger text-[13px]">{list.error.message}</div>
          ) : !list.data?.length ? (
            <EmptyState icon={<SearchIcon size={28} />} title="אין תוצאות" body={`לא נמצאו רשומות עבור «${trimmed}».`} />
          ) : (
            <div className="space-y-2">
              {list.data.map(hit => (
                <Link
                  key={`${hit.type}:${hit.id}`}
                  to={hit.to}
                  className="flex items-center gap-3 p-3 rounded-sc-input border border-sc-border bg-white hover:bg-sc-bg/60 transition-colors"
                >
                  <Pill kind={TYPE_PILL[hit.type]}>{TYPE_LABEL[hit.type]}</Pill>
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] truncate">{hit.label}</div>
                    {hit.sublabel && (
                      <div className="text-[12px] text-sc-text-secondary truncate">{hit.sublabel}</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
