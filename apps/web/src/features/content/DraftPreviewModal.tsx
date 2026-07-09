// Draft preview modal — the 1:1 visual preview of a Parker article draft
// (classic/magazine/dynamic layouts) + approve/reject. Approval flips the row
// to 'approved'; the host publish-worker then merges, deploys and marks it
// 'published' automatically — approving here IS publishing.
import { Check, X } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { buildArticlePreviewHtml, type DraftArticle } from './articlePreview'

export function DraftPreviewModal({ id, onClose }: { id: string; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const q = trpc.contentDrafts.detail.useQuery({ id }, { refetchOnWindowFocus: false })
  const decide = trpc.contentDrafts.decide.useMutation({
    onSuccess: (_d, vars) => {
      toast.show(
        vars.decision === 'approved'
          ? 'אושר — הכתבה מתפרסמת לאתר אוטומטית (2-3 דקות)'
          : 'הטיוטה נדחתה',
      )
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
                <Check size={15} /> אשר ופרסם לאתר
              </Button>
              <Button
                variant="ghost"
                onClick={() => decide.mutate({ id, decision: 'rejected' })}
                disabled={decide.isLoading}
              >
                <X size={15} /> דחה
              </Button>
              <span className="text-[12px] text-sc-text-muted">
                אישור = פרסום אוטומטי לאתר תוך דקות; דחייה מחזירה ל-Parker.
              </span>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
