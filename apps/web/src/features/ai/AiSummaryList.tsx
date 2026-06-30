// The AI summaries table + status filter tabs. The page passes in data and the
// row-click handler; KPIs live on the page next to the prompt panel.
import { useMemo, useState } from 'react'
import { DataTable } from '@/components/ui/DataTable'
import type { AiSummaryRow, AiJobStatus } from '@asset-rise/shared'
import { aiColumns } from './columns'

const STATUS_TABS: { key: '' | AiJobStatus; label: string }[] = [
  { key: '', label: 'הכל' },
  { key: 'done', label: 'הושלמו' },
  { key: 'running', label: 'רצים' },
  { key: 'pending', label: 'ממתינים' },
  { key: 'failed', label: 'נכשלו' },
]

export function AiSummaryList({
  data,
  loading,
  onRowClick,
}: {
  data: AiSummaryRow[]
  loading: boolean
  onRowClick: (r: AiSummaryRow) => void
}) {
  const [statusFilter, setStatusFilter] = useState<'' | AiJobStatus>('')

  const rows = useMemo(
    () => (statusFilter ? data.filter(r => r.status === statusFilter) : data),
    [data, statusFilter],
  )

  return (
    <DataTable<AiSummaryRow>
      columns={aiColumns}
      data={rows}
      loading={loading}
      onRowClick={onRowClick}
      csvName="ai-summaries"
      searchPlaceholder="חיפוש לפי תקציר, מפתח מחקר, מודל…"
      emptyTitle="אין ניתוחי AI"
      emptyBody="כשהאנלייזר יפיק ניתוחי AI הם יופיעו כאן."
      toolbar={
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TABS.map(t => (
            <button
              key={t.key || 'all'}
              onClick={() => setStatusFilter(t.key)}
              className={`px-3 py-1.5 rounded-sc-pill text-[12px] font-bold border transition-colors ${
                statusFilter === t.key
                  ? 'bg-sc-primary text-white border-sc-primary'
                  : 'bg-white text-sc-text-secondary border-sc-border hover:border-sc-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    />
  )
}
