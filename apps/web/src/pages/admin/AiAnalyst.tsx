// AI Analyst Control — operational view of the analyzer's AI layer. Thin page:
// fetch recent AI summaries, lay out KPIs + the summaries table (→ SummaryDrawer)
// + the prompt-versions panel. Heavy UI lives in features/ai/*.
import { useMemo, useState } from 'react'
import { Sparkles, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { AiSummaryList } from '@/features/ai/AiSummaryList'
import { SummaryDrawer } from '@/features/ai/SummaryDrawer'
import { PromptVersionsPanel } from '@/features/ai/PromptVersionsPanel'

export default function AdminAiAnalyst() {
  const list = trpc.ai.list.useQuery(undefined, { refetchOnWindowFocus: false })
  const [active, setActive] = useState<string | null>(null)

  const all = list.data ?? []

  const kpis = useMemo(() => {
    const total = all.length
    const done = all.filter(r => r.status === 'done').length
    const running = all.filter(r => r.status === 'running' || r.status === 'pending').length
    const failed = all.filter(r => r.status === 'failed').length
    return { total, done, running, failed }
  }, [all])

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>בקרת אנלייזר AI</h1>
          <div className="sub">
            ניתוחי ה-AI של מנוע ההיתכנות · חוות דעת, פאנל 3 הכובעים וגרסאות הפרומפט
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label="סך הכל ניתוחים"
          value={kpis.total}
          icon={<Sparkles size={18} />}
          tone="primary"
          index={0}
        />
        <KpiCard
          label="הושלמו"
          value={kpis.done}
          icon={<CheckCircle2 size={18} />}
          tone="success"
          index={1}
        />
        <KpiCard
          label="רצים / ממתינים"
          value={kpis.running}
          icon={<Loader2 size={18} />}
          tone="gold"
          index={2}
        />
        <KpiCard
          label="נכשלו"
          value={kpis.failed}
          icon={<AlertTriangle size={18} />}
          tone="danger"
          index={3}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2">
          <AiSummaryList
            data={all}
            loading={list.isLoading}
            onRowClick={r => setActive(r.research_key)}
          />
        </div>
        <div className="xl:col-span-1">
          <PromptVersionsPanel agent="analyzer" />
        </div>
      </div>

      {active && <SummaryDrawer researchKey={active} onClose={() => setActive(null)} />}
    </div>
  )
}
