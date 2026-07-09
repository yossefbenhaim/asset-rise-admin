// Parker's newsroom panel (rendered on /agents/newsroom) — the reporter's desk:
// what's LIVE on the customer site, what's in DRAFT, and direct publish (a
// draft approved here goes live automatically via the host publish-worker).
import { useState } from 'react'
import {
  Newspaper,
  Building2,
  BookOpen,
  ExternalLink,
  Eye,
  Clock,
  CheckCircle2,
  Send,
} from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Pill } from '@/components/ui/Pill'
import { Section } from '@/features/agents/meta'
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

function LiveCard({
  url,
  title,
  sub,
  icon,
}: {
  url: string
  title: string
  sub: string
  icon: React.ReactNode
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="sc-card p-3.5 flex items-center gap-3 hover:shadow-md transition-shadow"
    >
      <span className="w-9 h-9 rounded-lg bg-sc-gold/10 text-sc-gold flex items-center justify-center flex-shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-black text-sc-text truncate">{title}</span>
        <span dir="ltr" className="block text-[11px] text-sc-text-muted truncate text-right">
          {sub}
        </span>
      </span>
      <ExternalLink size={13} className="text-sc-text-muted flex-shrink-0" />
    </a>
  )
}

export function NewsroomPanel() {
  const [openId, setOpenId] = useState<string | null>(null)
  const drafts = trpc.contentDrafts.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchInterval: 30_000,
  })
  const live = trpc.content.published.useQuery(undefined, { refetchOnWindowFocus: false })
  const d = live.data
  const rows = drafts.data?.drafts ?? []
  const activeDrafts = rows.filter(r => r.status === 'pending' || r.status === 'approved')
  const history = rows.filter(r => r.status === 'published' || r.status === 'rejected').slice(0, 6)

  return (
    <>
      <Section title={`שולחן המערכת — טיוטות (${activeDrafts.length})`} icon={<Send size={13} />}>
        {activeDrafts.length === 0 ? (
          <div className="text-[12px] text-sc-text-muted bg-sc-bg rounded-lg px-3 py-2.5">
            אין טיוטות ממתינות — הסקאוט הבא ירוץ תוך יומיים, הכתבה הבאה ביום שני 07:00.
          </div>
        ) : (
          <div className="space-y-1.5">
            {activeDrafts.map(r => (
              <button
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className="w-full flex items-center gap-2.5 text-[13px] bg-sc-gold/5 border border-sc-gold/30 hover:bg-sc-gold/10 transition-colors rounded-lg px-3 py-2.5 text-right cursor-pointer"
              >
                <Newspaper size={15} className="text-sc-gold flex-shrink-0" />
                <span className="font-extrabold text-sc-text truncate flex-1">{r.title}</span>
                <Pill kind={STATUS_PILL[r.status] ?? 'neutral'}>
                  {STATUS_HE[r.status] ?? r.status}
                </Pill>
                <Eye size={14} className="text-sc-text-muted flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
        {history.length > 0 && (
          <div className="mt-2 space-y-1">
            {history.map(r => (
              <div
                key={r.id}
                className="flex items-center gap-2 text-[12px] text-sc-text-secondary px-3 py-1"
              >
                {r.status === 'published' ? (
                  <CheckCircle2 size={12} className="text-sc-success" />
                ) : (
                  <Clock size={12} className="text-sc-text-muted" />
                )}
                <span className="truncate">{r.title}</span>
                <Pill kind={STATUS_PILL[r.status] ?? 'neutral'}>
                  {STATUS_HE[r.status] ?? r.status}
                </Pill>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={`באוויר עכשיו (${(d?.news.length ?? 0) + (d?.cities.length ?? 0) + (d?.guides.length ?? 0)})`}
        icon={<Newspaper size={13} />}
      >
        {live.isLoading ? (
          <div className="text-[12px] text-sc-text-muted">טוען…</div>
        ) : (
          <div className="space-y-3">
            {d?.news.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {d.news.map(n => (
                  <LiveCard
                    key={n.url}
                    url={n.url}
                    title={n.slug}
                    sub={n.path}
                    icon={<Newspaper size={16} />}
                  />
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-sc-text-muted bg-sc-bg rounded-lg px-3 py-2.5">
                אין עדיין כתבות באוויר — הראשונה מחכה לאישורך בטיוטות.
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(d?.cities ?? []).map(c => (
                <LiveCard
                  key={c.url}
                  url={c.url}
                  title={`פינוי בינוי · ${c.slug}`}
                  sub={c.path}
                  icon={<Building2 size={16} />}
                />
              ))}
              {(d?.guides ?? []).map(g => (
                <LiveCard
                  key={g.url}
                  url={g.url}
                  title={`מדריך · ${g.slug}`}
                  sub={g.path}
                  icon={<BookOpen size={16} />}
                />
              ))}
            </div>
          </div>
        )}
      </Section>

      {openId && <DraftPreviewModal id={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}
