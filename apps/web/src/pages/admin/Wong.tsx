// Wong · אימות מסמכים — control surface for the document-verification agent.
// "Wong" is the host worker that reads uploaded tenant documents and decides,
// automatically, whether each plausibly is the document its workflow task asks
// for. This page is a READ-ONLY window: KPI counters from wong.stats + a table
// of recent verifications (wong.list) with a verdict drawer.
import { useState } from 'react'
import { ShieldCheck, Clock3, CheckCircle2, XCircle, ListChecks, History } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { KpiCard } from '@/components/ui/KpiCard'
import { VerificationsTable, type WongStatusFilter } from '@/features/wong/VerificationsTable'
import { PromptVersionsPanel } from '@/features/ai/PromptVersionsPanel'

type WongTab = 'verifications' | 'prompts'

export default function AdminWong() {
  const [status, setStatus] = useState<WongStatusFilter>('all')
  const [tab, setTab] = useState<WongTab>('verifications')

  const stats = trpc.wong.stats.useQuery(undefined, { refetchOnWindowFocus: false })
  const list = trpc.wong.list.useQuery(
    { status, limit: 300 },
    { refetchOnWindowFocus: false, keepPreviousData: true },
  )

  const s = stats.data

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div className="flex items-center gap-3">
          {/* Wong identity badge */}
          <span className="grid place-items-center w-11 h-11 rounded-sc-card bg-sc-navy text-white shrink-0">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1>Wong · אימות מסמכים</h1>
            <div className="sub">
              הסוכן שבודק ומאשר אוטומטית מסמכים שדיירים מעלים
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label="ממתינים לבדיקה"
          value={s?.pending ?? 0}
          icon={<Clock3 size={18} />}
          tone="gold"
          index={0}
        />
        <KpiCard
          label="אושרו"
          value={s?.approved ?? 0}
          icon={<CheckCircle2 size={18} />}
          tone="success"
          index={1}
        />
        <KpiCard
          label="נדחו"
          value={s?.rejected ?? 0}
          icon={<XCircle size={18} />}
          tone="danger"
          index={2}
        />
        <KpiCard
          label="נבדקו היום"
          value={s?.today ?? 0}
          icon={<ShieldCheck size={18} />}
          tone="primary"
          index={3}
        />
      </div>

      {/* Tabs: verifications table | prompt versions */}
      <div className="flex items-center gap-1.5 mb-4 border-b border-sc-border">
        {([
          { key: 'verifications' as const, label: 'אימותים', icon: <ListChecks size={15} /> },
          { key: 'prompts' as const, label: 'גרסאות פרומפט', icon: <History size={15} /> },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-bold border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-sc-primary text-sc-primary'
                : 'border-transparent text-sc-text-secondary hover:text-sc-text'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'verifications' ? (
        <VerificationsTable
          rows={list.data ?? []}
          loading={list.isLoading}
          status={status}
          onStatusChange={setStatus}
        />
      ) : (
        <div className="max-w-2xl">
          <PromptVersionsPanel agent="wong" />
        </div>
      )}
    </div>
  )
}
