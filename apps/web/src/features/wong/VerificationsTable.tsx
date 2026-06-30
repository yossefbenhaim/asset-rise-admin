// Wong verifications table: status filter toolbar + search + DataTable, with
// row-click → VerificationDrawer. Presentational — the page owns data fetching +
// the status filter; this component owns only the open-drawer state.
import { useState } from 'react'
import type { WongVerification, WongStatus } from '@asset-rise/shared'
import { DataTable } from '@/components/ui/DataTable'
import { wongColumns } from './columns'
import { VerificationDrawer } from './VerificationDrawer'

export type WongStatusFilter = WongStatus | 'all'

const STATUS_TABS: { key: WongStatusFilter; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'pending', label: 'ממתינים' },
  { key: 'running', label: 'בבדיקה' },
  { key: 'done', label: 'הוכרעו' },
  { key: 'failed', label: 'נכשלו' },
]

export function VerificationsTable({
  rows,
  loading,
  status,
  onStatusChange,
}: {
  rows: WongVerification[]
  loading?: boolean
  status: WongStatusFilter
  onStatusChange: (s: WongStatusFilter) => void
}) {
  const [active, setActive] = useState<WongVerification | null>(null)

  return (
    <>
      <DataTable<WongVerification>
        columns={wongColumns}
        data={rows}
        loading={loading}
        onRowClick={(r) => setActive(r)}
        csvName="doc-verifications"
        searchPlaceholder="חיפוש לפי מסמך, דייר או נימוק…"
        emptyTitle="אין אימותי מסמכים"
        emptyBody="כאשר דיירים יעלו מסמכים לאימות, ההכרעות של הסוכן יופיעו כאן."
        toolbar={
          <div className="flex flex-wrap gap-1.5">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => onStatusChange(t.key)}
                className={`px-3 py-1.5 rounded-sc-pill text-[12px] font-bold border transition-colors ${
                  status === t.key
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

      {active && <VerificationDrawer row={active} onClose={() => setActive(null)} />}
    </>
  )
}
