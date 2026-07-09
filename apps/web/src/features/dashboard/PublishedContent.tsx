// "Parker's live content" dashboard card — every article/page the reporter
// agent has published on the customer site, linked. News articles are the
// headline act; city pages and guides fold into compact chip rows.
import { motion } from 'framer-motion'
import { Newspaper, Building2, BookOpen, ExternalLink } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Pill } from '@/components/ui/Pill'

const fade = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
}

function ChipRow({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode
  label: string
  items: Array<{ url: string; slug: string }>
}) {
  if (!items.length) return null
  return (
    <div className="flex items-start gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-[12px] font-extrabold text-sc-text-muted uppercase tracking-wide flex-shrink-0 mt-1">
        {icon}
        {label} ({items.length})
      </span>
      <div className="flex flex-wrap gap-1.5">
        {items.map(i => (
          <a
            key={i.url}
            href={i.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-bold text-sc-text bg-sc-bg hover:bg-sc-light-blue/40 transition-colors rounded-full px-2.5 py-1"
          >
            {i.slug}
            <ExternalLink size={10} className="text-sc-text-muted" />
          </a>
        ))}
      </div>
    </div>
  )
}

export function PublishedContent({ index = 0 }: { index?: number }) {
  const q = trpc.content.published.useQuery(undefined, { refetchOnWindowFocus: false })
  const d = q.data
  if (!d && !q.isLoading) return null

  return (
    <motion.div variants={fade} transition={{ delay: index * 0.04 }} className="sc-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Newspaper size={16} className="text-sc-gold" />
        <span className="text-[14px] font-black text-sc-text">התוכן החי באתר · Parker</span>
        <Pill kind="gold">
          {(d?.news.length ?? 0) + (d?.cities.length ?? 0) + (d?.guides.length ?? 0)} עמודים
        </Pill>
        <a
          href="https://asset-rise.byclick.co.il/news"
          target="_blank"
          rel="noopener noreferrer"
          className="mr-auto inline-flex items-center gap-1 text-[12px] font-bold text-sc-primary hover:underline"
        >
          עמוד החדשות <ExternalLink size={11} />
        </a>
      </div>

      {q.isLoading ? (
        <div className="text-[13px] text-sc-text-secondary">טוען…</div>
      ) : (
        <div className="space-y-3">
          {d?.news.length ? (
            <div className="space-y-1.5">
              {d.news.map(n => (
                <a
                  key={n.url}
                  href={n.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[13px] bg-sc-gold/5 border border-sc-gold/30 hover:bg-sc-gold/10 transition-colors rounded-lg px-3 py-2"
                >
                  <Newspaper size={14} className="text-sc-gold flex-shrink-0" />
                  <span className="font-bold text-sc-text truncate">/news/{n.slug}</span>
                  {n.lastmod && (
                    <span className="text-[11px] text-sc-text-muted sc-num flex-shrink-0">
                      {n.lastmod}
                    </span>
                  )}
                  <ExternalLink size={12} className="text-sc-text-muted mr-auto flex-shrink-0" />
                </a>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-sc-text-muted">
              עדיין אין כתבות חדשות — הכתבה השבועית הראשונה של Parker בדרך.
            </div>
          )}
          <ChipRow icon={<Building2 size={12} />} label="עמודי ערים" items={d?.cities ?? []} />
          <ChipRow icon={<BookOpen size={12} />} label="מדריכים" items={d?.guides ?? []} />
        </div>
      )}
    </motion.div>
  )
}
