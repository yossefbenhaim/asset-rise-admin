// Wong · אימות מסמכים — control surface for the document-verification agent.
// "Wong" is the host worker that reads uploaded tenant documents and decides,
// automatically, whether each plausibly is the document its workflow task asks
// for. UI is kept 1:1 with the Analyzer control page (AiAnalyst): KPIs + a
// recent-verifications table (2 cols) beside the prompt-versions panel (1 col),
// no tabs.
import { useState } from 'react'
import { ShieldCheck, Clock3, CheckCircle2, XCircle } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { VerificationsTable, type WongStatusFilter } from '@/features/wong/VerificationsTable'
import { PromptVersionsPanel } from '@/features/ai/PromptVersionsPanel'

export default function AdminWong() {
  const [status, setStatus] = useState<WongStatusFilter>('all')

  const stats = trpc.wong.stats.useQuery(undefined, { refetchOnWindowFocus: false })
  const list = trpc.wong.list.useQuery(
    { status, limit: 300 },
    { refetchOnWindowFocus: false, keepPreviousData: true },
  )

  const s = stats.data

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>בקרת Wong · אימות מסמכים</h1>
          <div className="sub">הסוכן שבודק ומאשר אוטומטית מסמכים שדיירים מעלים · היסטוריית אימותים וגרסאות הפרומפט</div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="ממתינים לבדיקה" value={s?.pending ?? 0} icon={<Clock3 size={18} />} tone="gold" index={0} />
        <KpiCard label="אושרו" value={s?.approved ?? 0} icon={<CheckCircle2 size={18} />} tone="success" index={1} />
        <KpiCard label="נדחו" value={s?.rejected ?? 0} icon={<XCircle size={18} />} tone="danger" index={2} />
        <KpiCard label="נבדקו היום" value={s?.today ?? 0} icon={<ShieldCheck size={18} />} tone="primary" index={3} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2">
          <VerificationsTable
            rows={list.data ?? []}
            loading={list.isLoading}
            status={status}
            onStatusChange={setStatus}
          />
        </div>
        <div className="xl:col-span-1">
          <PromptVersionsPanel agent="wong" />
        </div>
      </div>
    </div>
  )
}
