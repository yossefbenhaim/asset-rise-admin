import { useMemo, useState } from 'react'
import { ScrollText, AlertTriangle, ShieldCheck } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { LogsTable, type SeverityFilter } from '@/features/logs/LogsTable'

export default function AdminLogs() {
  const [severity, setSeverity] = useState<SeverityFilter>('all')

  // Fetch the full merged feed once; KPIs stay stable over the whole feed while
  // the severity tabs narrow only the table rows (filtered client-side here).
  const list = trpc.logs.list.useQuery({ limit: 500 }, { refetchOnWindowFocus: false })
  const all = list.data ?? []

  const kpis = useMemo(() => {
    const total = all.length
    const errors = all.filter((e) => e.severity === 'error').length
    const audit = all.filter((e) => e.service === 'audit').length
    return { total, errors, audit }
  }, [all])

  const rows = useMemo(
    () => (severity === 'all' ? all : all.filter((e) => e.severity === severity)),
    [all, severity],
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>יומן מערכת</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <KpiCard label="סך רשומות" value={kpis.total} icon={<ScrollText size={18} />} tone="primary" index={0} />
        <KpiCard label="שגיאות" value={kpis.errors} icon={<AlertTriangle size={18} />} tone="danger" index={1} />
        <KpiCard label="פעולות ביקורת" value={kpis.audit} icon={<ShieldCheck size={18} />} tone="success" index={2} />
      </div>

      <LogsTable
        rows={rows}
        loading={list.isLoading}
        severity={severity}
        onSeverityChange={setSeverity}
      />
    </div>
  )
}
