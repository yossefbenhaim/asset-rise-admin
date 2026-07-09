// טיוטות תוכן — Parker's article drafts, previewed EXACTLY as they will look on
// the customer site. Approving a draft publishes it automatically (the host
// publish-worker merges + deploys). The same desk also lives on Parker's agent
// page (/agents/newsroom).
import { useState } from 'react'
import { Newspaper, Eye, GitBranch } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Pill } from '@/components/ui/Pill'
import { DraftPreviewModal } from '@/features/content/DraftPreviewModal'

const STATUS_PILL: Record<string, 'warning' | 'success' | 'neutral' | 'info'> = {
  pending: 'warning',
  approved: 'info',
  rejected: 'neutral',
  published: 'success',
}
const STATUS_HE: Record<string, string> = {
  pending: 'ממתין לאישורך',
  approved: 'מתפרסם עכשיו…',
  rejected: 'נדחה',
  published: 'פורסם',
}

export default function AdminContentDrafts() {
  const [openId, setOpenId] = useState<string | null>(null)
  const list = trpc.contentDrafts.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 30_000,
  })
  const drafts = list.data?.drafts ?? []

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>טיוטות תוכן · Parker</h1>
          <div className="sub">
            כל כתבה נעצרת כאן קודם — תצוגה מקדימה אחד-לאחד כמו באתר. אישור = פרסום אוטומטי לאתר תוך
            דקות.
          </div>
        </div>
      </div>

      {list.isLoading ? (
        <div className="sc-card p-6 text-[13px] text-sc-text-secondary">טוען טיוטות…</div>
      ) : drafts.length === 0 ? (
        <div className="sc-card p-6 text-[13px] text-sc-text-secondary">
          אין טיוטות עדיין — הריצה השבועית של Parker (יום שני 07:00) תגיש לכאן את הכתבה הבאה.
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map(d => (
            <button
              key={d.id}
              onClick={() => setOpenId(d.id)}
              className="w-full sc-card p-4 text-right cursor-pointer border-0 hover:shadow-md transition-shadow flex items-center gap-3"
            >
              <Newspaper size={16} className="text-sc-gold flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-black text-sc-text truncate">{d.title}</div>
                <div className="flex items-center gap-2 text-[11px] text-sc-text-muted mt-0.5">
                  <span className="sc-num">{new Date(d.created_at).toLocaleString('he-IL')}</span>
                  {d.branch && (
                    <span dir="ltr" className="inline-flex items-center gap-1 font-mono">
                      <GitBranch size={10} />
                      {d.branch}
                    </span>
                  )}
                </div>
              </div>
              <Pill kind={STATUS_PILL[d.status] ?? 'neutral'}>
                {STATUS_HE[d.status] ?? d.status}
              </Pill>
              <Eye size={15} className="text-sc-text-muted flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {openId && <DraftPreviewModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
