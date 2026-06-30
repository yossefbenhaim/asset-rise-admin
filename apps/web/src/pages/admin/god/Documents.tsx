import { useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ControlPanel } from '@/components/ui/ControlPanel'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DangerConfirm } from '@/components/ui/DangerConfirm'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { FileText, Eye, Trash2, FolderOpen, ShieldAlert } from 'lucide-react'
import {
  DOCUMENT_VISIBILITIES,
  DOCUMENT_VISIBILITY_LABEL,
  DOCUMENT_SOURCE_KINDS,
  DOCUMENT_SOURCE_KIND_LABEL,
  DOCUMENT_KIND_LABEL,
  type GodDocumentVisibility,
  type GodDocumentSourceKind,
  type GodDocumentListItem,
  type GodDocumentDetail,
} from '@asset-rise/shared/schemas/godDocuments'

// God-mode "Documents" page (Wave 3 — content + comms). Lists ALL
// sc_tenant_documents across buildings/projects with the resolved uploader +
// source label, filters by building/kind/source/visibility, drills into one,
// and runs the audited god writes:
//   setVisibility  — override who sees a doc (non-private target gated by a
//                    DangerConfirm, since it EXPOSES the doc more widely)
//   removeDocument — SOFT remove ("mark hidden"): there is no deleted_at column,
//                    so the doc is set private + detached from building/project.
//                    The storage object is NEVER deleted. DangerConfirm (type
//                    the title / file name).
//
// The god.documents router is an isolated sibling that the integration step
// merges into the god router; until that lands its procedures aren't on the
// typed tRPC client, so this page reaches them through a thin typed accessor.
// All call sites stay strongly typed against the shared schema interfaces.
const god = trpc as unknown as {
  god: {
    documents: {
      list: {
        useQuery: (
          input: {
            q?: string
            building_id?: string
            project_id?: string
            kind?: string
            source_kind?: GodDocumentSourceKind
            visibility?: GodDocumentVisibility
            limit?: number
          },
          opts?: { keepPreviousData?: boolean },
        ) => {
          data?: GodDocumentListItem[]
          isLoading: boolean
          isError: boolean
          error: { message: string } | null
        }
        invalidate: () => Promise<void>
      }
      get: {
        useQuery: (input: { id: string }) => {
          data?: GodDocumentDetail
          isLoading: boolean
          isError: boolean
          error: { message: string } | null
        }
        invalidate: (input: { id: string }) => Promise<void>
      }
      setVisibility: {
        useMutation: (
          o: MutOpts,
        ) => Mut<{ id: string; visibility: GodDocumentVisibility; confirm?: string }>
      }
      removeDocument: { useMutation: (o: MutOpts) => Mut<{ id: string; confirm: string }> }
    }
  }
}

type MutOpts = { onSuccess?: () => void; onError?: (e: { message: string }) => void }
type Mut<TInput> = { mutate: (input: TInput) => void; isLoading: boolean }

const inputCls = 'border border-sc-border rounded-sc-input p-2 w-full text-[13px]'
const labelCls = 'text-[12px] text-sc-text-secondary mb-1 block'

function kindLabel(k: string | null | undefined): string {
  if (!k) return '—'
  return DOCUMENT_KIND_LABEL[k] ?? k
}
function visibilityLabel(v: string | null | undefined): string {
  if (!v) return '—'
  return (DOCUMENT_VISIBILITY_LABEL as Record<string, string>)[v] ?? v
}
function sourceLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return (DOCUMENT_SOURCE_KIND_LABEL as Record<string, string>)[s] ?? s
}
function visibilityPillKind(v: string | null | undefined): string {
  switch (v) {
    case 'private':
      return 'neutral'
    case 'building':
      return 'info'
    case 'provider':
      return 'gold'
    default:
      return 'neutral'
  }
}

export default function GodDocuments() {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [sourceKind, setSourceKind] = useState('')
  const [visibility, setVisibility] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  const list = god.god.documents.list.useQuery(
    {
      q: q.trim() || undefined,
      kind: kind || undefined,
      source_kind: (sourceKind || undefined) as GodDocumentSourceKind | undefined,
      visibility: (visibility || undefined) as GodDocumentVisibility | undefined,
      limit: 200,
    },
    { keepPreviousData: true },
  )

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>מסמכים — מנהל-על</h1>
      </div>

      <ControlPanel
        title="שליטה במסמכים"
        description="צפייה בכל המסמכים בכל הבניינים והפרויקטים, שינוי חשיפה (מי רואה מסמך) והסרה רכה של מסמך. הסרה אינה מוחקת את הקובץ מהאחסון — היא רק מסתירה את המסמך (מסמנת אותו פרטי ומנתקת אותו מהבניין/פרויקט). כל פעולה נרשמת ביומן הביקורת."
        tone="danger"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className={inputCls}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="חיפוש לפי כותרת / שם קובץ / מקור / כתובת / מעלה…"
          />
          <select className={`${inputCls} sm:w-44`} value={visibility} onChange={e => setVisibility(e.target.value)}>
            <option value="">כל החשיפות</option>
            {DOCUMENT_VISIBILITIES.map(v => (
              <option key={v} value={v}>{DOCUMENT_VISIBILITY_LABEL[v]}</option>
            ))}
          </select>
          <select className={`${inputCls} sm:w-40`} value={sourceKind} onChange={e => setSourceKind(e.target.value)}>
            <option value="">כל המקורות</option>
            {DOCUMENT_SOURCE_KINDS.map(s => (
              <option key={s} value={s}>{DOCUMENT_SOURCE_KIND_LABEL[s]}</option>
            ))}
          </select>
          <input
            className={`${inputCls} sm:w-36`}
            value={kind}
            onChange={e => setKind(e.target.value)}
            placeholder="סוג (kind)"
          />
        </div>
      </ControlPanel>

      <Card className="mt-4">
        <CardHeader title="מסמכים" meta={<Pill kind="info">{list.data?.length ?? 0}</Pill>} />
        <CardBody>
          {list.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : list.isError ? (
            <div className="text-center py-6 text-sc-danger text-[13px]">{list.error?.message}</div>
          ) : !list.data?.length ? (
            <EmptyState icon={<FileText size={28} />} title="אין מסמכים" body="לא נמצאו מסמכים התואמים את הסינון." />
          ) : (
            <div className="sc-table-wrap">
              <table className="sc-table">
                <thead>
                  <tr>
                    <th>כותרת / קובץ</th>
                    <th>סוג</th>
                    <th>חשיפה</th>
                    <th>מקור</th>
                    <th>בניין</th>
                    <th>פרויקט</th>
                    <th>מעלה</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map(d => (
                    <tr key={d.id}>
                      <td className="font-semibold">{d.title || d.file_name || '—'}</td>
                      <td><Pill kind="neutral">{kindLabel(d.kind)}</Pill></td>
                      <td><Pill kind={visibilityPillKind(d.visibility) as any}>{visibilityLabel(d.visibility)}</Pill></td>
                      <td className="text-[12px]">
                        {sourceLabel(d.source_kind)}
                        {d.source_label ? ` · ${d.source_label}` : ''}
                      </td>
                      <td className="text-[12px]">{d.building_address || '—'}</td>
                      <td className="text-[12px]">{d.project_name || '—'}</td>
                      <td className="text-[12px]">{d.uploader_name || d.uploader_email || '—'}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<Eye size={14} />}
                          onClick={() => setActiveId(d.id)}
                        >
                          פתח
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {activeId && <DocumentDetail id={activeId} onClose={() => setActiveId(null)} />}
    </div>
  )
}

function DocumentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = god.god.documents.get.useQuery({ id })

  if (detail.isLoading) {
    return (
      <Modal open onClose={onClose} title="פרטי מסמך">
        <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
      </Modal>
    )
  }
  if (detail.isError || !detail.data) {
    return (
      <Modal open onClose={onClose} title="פרטי מסמך">
        <div className="text-center py-6 text-sc-danger text-[13px]">{detail.error?.message ?? 'לא נמצא'}</div>
      </Modal>
    )
  }
  return <DocumentDetailBody d={detail.data} onClose={onClose} />
}

function DocumentDetailBody({ d, onClose }: { d: GodDocumentDetail; onClose: () => void }) {
  const toast = useToast()
  const [removeOpen, setRemoveOpen] = useState(false)
  const [visConfirmOpen, setVisConfirmOpen] = useState(false)
  const [visibility, setVisibility] = useState<string>(d.visibility ?? 'private')

  function refresh() {
    void god.god.documents.get.invalidate({ id: d.id })
    void god.god.documents.list.invalidate()
  }

  const setVisM = god.god.documents.setVisibility.useMutation({
    onSuccess: () => { toast.show('חשיפת המסמך עודכנה'); setVisConfirmOpen(false); refresh() },
    onError: e => toast.show(e.message),
  })
  const removeM = god.god.documents.removeDocument.useMutation({
    onSuccess: () => { toast.show('המסמך הוסתר'); setRemoveOpen(false); onClose(); refresh() },
    onError: e => toast.show(e.message),
  })

  const removeToken = d.title || d.file_name || d.id
  // Exposing a doc more widely (non-private target) needs the type-the-name
  // interlock; reverting to private does not.
  const exposing = visibility !== 'private'
  // The migration-024 CHECK: a non-private visibility requires a building_id.
  const blockedNoBuilding = exposing && !d.building_id

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={`מסמך: ${d.title || d.file_name || d.id}`}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>סגור</Button>
          </div>
        }
      >
        <div className="space-y-5 text-[13px]">
          {/* Summary */}
          <div className="space-y-1">
            <Row label="כותרת" value={d.title || '—'} />
            <Row label="שם קובץ" value={d.file_name || '—'} />
            <Row label="סוג (kind)" value={<Pill kind="neutral">{kindLabel(d.kind)}</Pill>} />
            <Row label="קטגוריה (legacy)" value={d.category || '—'} />
            <Row label="חשיפה נוכחית" value={<Pill kind={visibilityPillKind(d.visibility) as any}>{visibilityLabel(d.visibility)}</Pill>} />
            <Row label="חסוי" value={d.is_confidential ? <Pill kind="warning">חסוי</Pill> : <Pill kind="neutral">לא חסוי</Pill>} />
            <Row label="מקור" value={`${sourceLabel(d.source_kind)}${d.source_label ? ` · ${d.source_label}` : ''}`} />
            <Row label="בניין" value={d.building_address || '—'} />
            <Row label="פרויקט" value={d.project_name || '—'} />
            <Row label="בעלים" value={d.owner_name ? `${d.owner_name}${d.owner_email ? ` · ${d.owner_email}` : ''}` : '—'} />
            <Row label="מעלה" value={d.uploader_name ? `${d.uploader_name}${d.uploader_email ? ` · ${d.uploader_email}` : ''}` : '—'} />
            <Row label="סוג קובץ" value={d.mime_type || '—'} />
            <Row label="נתיב אחסון (קריאה בלבד)" value={<span className="break-all text-[11px] text-sc-text-muted">{d.storage_path || '—'}</span>} />
            {d.created_at && (
              <Row label="נוצר" value={new Date(d.created_at).toLocaleString('he-IL')} />
            )}
          </div>

          {/* Set visibility */}
          <Section title="שינוי חשיפה" icon={<Eye size={15} />} danger>
            <p className="text-sc-text-secondary text-[12px] m-0 mb-2">
              קביעת מי רואה את המסמך. חשיפה לבניין/ספק חושפת אותו ליותר אנשים — נדרש אישור. מסמך שאינו פרטי חייב להיות משויך לבניין.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className={labelCls}>בחר/י חשיפה</span>
                <select className={`${inputCls} min-w-[200px]`} value={visibility} onChange={e => setVisibility(e.target.value)}>
                  {DOCUMENT_VISIBILITIES.map(v => (
                    <option key={v} value={v}>{DOCUMENT_VISIBILITY_LABEL[v]}</option>
                  ))}
                </select>
              </label>
              <Button
                size="sm"
                variant={exposing ? 'danger' : 'primary'}
                loading={setVisM.isLoading}
                disabled={visibility === d.visibility || blockedNoBuilding}
                onClick={() =>
                  exposing
                    ? setVisConfirmOpen(true)
                    : setVisM.mutate({ id: d.id, visibility: visibility as GodDocumentVisibility })
                }
              >עדכן חשיפה</Button>
            </div>
            {blockedNoBuilding && (
              <p className="text-sc-danger text-[12px] mt-2 m-0">
                אי אפשר לחשוף מסמך שאינו משויך לבניין. שייך/י אותו לבניין תחילה.
              </p>
            )}
          </Section>

          {/* Soft remove */}
          <Section title="הסרת מסמך (הסתרה)" icon={<Trash2 size={15} />} danger>
            <p className="text-sc-text-secondary text-[12px] m-0 mb-2">
              הסרה רכה: המסמך יסומן פרטי וינותק מהבניין/פרויקט כך שייעלם מכל הצדדים פרט למעלה אותו. הקובץ באחסון נשמר ואינו נמחק.
            </p>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 size={14} />}
              onClick={() => setRemoveOpen(true)}
            >הסר מסמך</Button>
          </Section>
        </div>
      </Modal>

      <DangerConfirm
        open={visConfirmOpen}
        onClose={() => setVisConfirmOpen(false)}
        title="שינוי חשיפת מסמך"
        confirmText={removeToken}
        confirmLabel={`חשוף כ«${visibilityLabel(visibility)}»`}
        loading={setVisM.isLoading}
        onConfirm={() => setVisM.mutate({ id: d.id, visibility: visibility as GodDocumentVisibility, confirm: removeToken })}
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0 flex items-center gap-1">
              <ShieldAlert size={14} /> פעולה חושפת!
            </p>
            <p className="m-0">
              שינוי החשיפה ל«{visibilityLabel(visibility)}» יחשוף את המסמך ליותר אנשים (כל דיירי הבניין / ספק הפרויקט). ודא/י שזו הכוונה.
            </p>
          </div>
        }
      />

      <DangerConfirm
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title="הסרת מסמך"
        confirmText={removeToken}
        confirmLabel="הסר מסמך"
        loading={removeM.isLoading}
        onConfirm={() => removeM.mutate({ id: d.id, confirm: removeToken })}
        body={
          <div className="space-y-2">
            <p className="text-sc-danger font-semibold m-0 flex items-center gap-1">
              <FolderOpen size={14} /> פעולה הרסנית!
            </p>
            <p className="m-0">
              הסרת המסמך תסמן אותו פרטי ותנתק אותו מהבניין/פרויקט — הוא ייעלם מכל הצדדים פרט למעלה אותו. הקובץ באחסון לא יימחק והרשומה לא תימחק מהמסד.
            </p>
          </div>
        }
      />
    </>
  )
}

function Section({
  title, icon, children, danger,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <div className={`rounded-sc-input border p-3 ${danger ? 'border-sc-danger bg-sc-danger-bg/30' : 'border-sc-border'}`}>
      <div className={`font-bold text-[13px] mb-2 flex items-center gap-2 ${danger ? 'text-sc-danger' : 'text-sc-text'}`}>
        {icon}{title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <div className="text-sc-text-secondary w-32 shrink-0">{label}</div>
      <div className="flex-1 break-words">{value}</div>
    </div>
  )
}
