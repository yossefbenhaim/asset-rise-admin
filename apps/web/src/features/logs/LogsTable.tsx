// System Logs table: severity filter toolbar + search + DataTable, with
// row-click → LogDetailDrawer. Presentational — the page owns data fetching +
// the severity filter state; this component owns only the open-drawer state.
import { useState } from 'react'
import type { LogEntry, LogSeverity } from '@asset-rise/shared'
import { DataTable } from '@/components/ui/DataTable'
import { logColumns } from './columns'
import { LogDetailDrawer } from './LogDetailDrawer'

export type SeverityFilter = LogSeverity | 'all'

const SEVERITY_TABS: { key: SeverityFilter; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'error', label: 'שגיאות' },
  { key: 'warning', label: 'אזהרות' },
  { key: 'info', label: 'מידע' },
]

export function LogsTable({
  rows,
  loading,
  severity,
  onSeverityChange,
}: {
  rows: LogEntry[]
  loading?: boolean
  severity: SeverityFilter
  onSeverityChange: (s: SeverityFilter) => void
}) {
  const [active, setActive] = useState<LogEntry | null>(null)

  return (
    <>
      <DataTable<LogEntry>
        columns={logColumns}
        data={rows}
        loading={loading}
        onRowClick={(r) => setActive(r)}
        csvName="logs"
        searchPlaceholder="חיפוש בהודעה או באימייל/שם משתמש…"
        emptyTitle="אין רשומות יומן"
        emptyBody="פעולות ביקורת וכשלי עיבוד יופיעו כאן כשיתרחשו."
        toolbar={
          <div className="flex flex-wrap gap-1.5">
            {SEVERITY_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => onSeverityChange(t.key)}
                className={`px-3 py-1.5 rounded-sc-pill text-[12px] font-bold border transition-colors ${
                  severity === t.key
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

      {active && <LogDetailDrawer entry={active} onClose={() => setActive(null)} />}
    </>
  )
}
