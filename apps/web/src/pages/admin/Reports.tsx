import { useMemo, useState } from 'react'
import { FileText, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { DataTable } from '@/components/ui/DataTable'
import type { ReportRow, ReportStatus } from '@asset-rise/shared'
import { reportColumns } from '@/features/reports/columns'
import { ReportDrawer } from '@/features/reports/ReportDrawer'

const STATUS_TABS: { key: '' | ReportStatus; label: string }[] = [
  { key: '', label: 'הכל' },
  { key: 'completed', label: 'הושלמו' },
  { key: 'processing', label: 'בעיבוד' },
  { key: 'queued', label: 'בתור' },
  { key: 'failed', label: 'נכשלו' },
]

export default function AdminReports() {
  const list = trpc.reports.list.useQuery(undefined, { refetchOnWindowFocus: false })
  const [active, setActive] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'' | ReportStatus>('')

  const all = list.data ?? []

  const kpis = useMemo(() => {
    const total = all.length
    const completed = all.filter(r => r.status === 'completed').length
    const processing = all.filter(r => r.status === 'processing' || r.status === 'queued').length
    const failed = all.filter(r => r.status === 'failed').length
    return { total, completed, processing, failed }
  }, [all])

  // Pinned first, then status filter. Within each group keep server (newest) order.
  const rows = useMemo(() => {
    const filtered = statusFilter ? all.filter(r => r.status === statusFilter) : all
    return [...filtered].sort((a, b) => Number(b.pinned) - Number(a.pinned))
  }, [all, statusFilter])

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>ניהול דוחות</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="סך הכל דוחות" value={kpis.total} icon={<FileText size={18} />} tone="primary" index={0} />
        <KpiCard label="הושלמו" value={kpis.completed} icon={<CheckCircle2 size={18} />} tone="success" index={1} />
        <KpiCard label="בעיבוד / בתור" value={kpis.processing} icon={<Loader2 size={18} />} tone="gold" index={2} />
        <KpiCard label="נכשלו" value={kpis.failed} icon={<AlertTriangle size={18} />} tone="danger" index={3} />
      </div>

      <DataTable<ReportRow>
        columns={reportColumns}
        data={rows}
        loading={list.isLoading}
        onRowClick={r => setActive(r.token)}
        csvName="reports"
        searchPlaceholder="חיפוש לפי כתובת, עיר, ליד…"
        emptyTitle="אין דוחות"
        emptyBody="כשלקוחות יפיקו דוחות היתכנות הם יופיעו כאן."
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

      {active && <ReportDrawer token={active} onClose={() => setActive(null)} />}
    </div>
  )
}
