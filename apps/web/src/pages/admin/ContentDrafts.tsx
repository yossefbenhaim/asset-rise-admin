// טיוטות תוכן — Parker's article drafts, previewed EXACTLY as they will look on
// the customer site (hero + overlay + logo chip + icons + sources), straight
// from the draft payload — nothing is deployed until Yossef approves here.
import { useState } from 'react'
import { Newspaper, Check, X, Eye, GitBranch } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Pill } from '@/components/ui/Pill'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { buildArticlePreviewHtml, type DraftArticle } from '@/features/content/articlePreview'

const STATUS_PILL: Record<string, 'warning' | 'success' | 'neutral' | 'info'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'neutral',
  published: 'info',
}
const STATUS_HE: Record<string, string> = {
  pending: 'ממתין לאישורך',
  approved: 'אושר — בדרך לאוויר',
  rejected: 'נדחה',
  published: 'פורסם',
}

function PreviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const q = trpc.contentDrafts.detail.useQuery({ id }, { refetchOnWindowFocus: false })
  const decide = trpc.contentDrafts.decide.useMutation({
    onSuccess: (_d, vars) => {
      toast.show(vars.decision === 'approved' ? 'הטיוטה אושרה' : 'הטיוטה נדחתה')
      utils.contentDrafts.list.invalidate()
      onClose()
    },
    onError: e => toast.show(e.message),
  })
  const draft = q.data?.draft
  const html = draft
    ? buildArticlePreviewHtml(draft.payload as DraftArticle, draft.hero_image_b64)
    : null

  return (
    <Modal
      open
      onClose={onClose}
      title={draft?.title ?? 'טיוטה'}
      subtitle={draft?.branch ?? undefined}
      size="xl"
    >
      {q.isLoading || !html ? (
        <div className="text-[13px] text-sc-text-secondary p-4">טוען תצוגה מקדימה…</div>
      ) : (
        <>
          <iframe
            srcDoc={html}
            title="תצוגה מקדימה"
            className="w-full rounded-lg border border-sc-border bg-white"
            style={{ height: '68vh' }}
          />
          {draft?.status === 'pending' && (
            <div className="flex items-center gap-2 mt-3">
              <Button
                onClick={() => decide.mutate({ id, decision: 'approved' })}
                disabled={decide.isLoading}
              >
                <Check size={15} /> אשר לפרסום
              </Button>
              <Button
                variant="ghost"
                onClick={() => decide.mutate({ id, decision: 'rejected' })}
                disabled={decide.isLoading}
              >
                <X size={15} /> דחה
              </Button>
              <span className="text-[12px] text-sc-text-muted">
                אישור כאן = עובר למיזוג ופריסה; דחייה מחזירה ל-Parker.
              </span>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

export default function AdminContentDrafts() {
  const [openId, setOpenId] = useState<string | null>(null)
  const list = trpc.contentDrafts.list.useQuery(undefined, { refetchOnWindowFocus: false })
  const drafts = list.data?.drafts ?? []

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>טיוטות תוכן · Parker</h1>
          <div className="sub">
            כל כתבה שהכתב מכין נעצרת כאן קודם — תצוגה מקדימה אחד-לאחד כמו באתר, ואישור שלך לפני שהיא
            עולה לאוויר.
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

      {openId && <PreviewModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
