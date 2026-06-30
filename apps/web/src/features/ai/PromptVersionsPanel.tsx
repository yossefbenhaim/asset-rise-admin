// RESEARCH_VERSION history panel. Lists known versions (current highlighted),
// shows a compare/diff placeholder between two picked versions, and — for
// super-admins (admin.ai.edit_prompt) — an edit box that upserts the prompt
// text into sc_ai_prompts (read by the host worker). Read-only users see the
// stored prompt (if any) without the editor.
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  History, GitCompare, Lock, Save, Info, ChevronLeft,
} from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { useRoleKeys } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { dateTime } from '@/lib/format'
import type { AiPromptVersion } from '@asset-rise/shared'

export function PromptVersionsPanel() {
  const roleKeys = useRoleKeys()
  const canEdit = can(roleKeys, 'admin.ai.edit_prompt')
  const q = trpc.ai.promptVersions.useQuery(undefined, { refetchOnWindowFocus: false })
  const data = q.data

  const [selected, setSelected] = useState<string | null>(null)
  const [compareWith, setCompareWith] = useState<string | null>(null)

  // Default-select the current version once data lands.
  useEffect(() => {
    if (data && !selected) setSelected(data.current)
  }, [data, selected])

  const versions = data?.versions ?? []
  const active = useMemo(
    () => versions.find(v => v.version === selected) ?? null,
    [versions, selected],
  )
  const other = useMemo(
    () => versions.find(v => v.version === compareWith) ?? null,
    [versions, compareWith],
  )

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            <History size={16} className="text-sc-primary" />
            גרסאות פרומפט
          </span>
        }
        meta={data ? `נוכחית: ${data.current}` : undefined}
      />
      <CardBody className="pt-0">
        {q.isLoading ? (
          <div className="space-y-2">
            <Skeleton h={36} /><Skeleton h={120} />
          </div>
        ) : q.isError || !data ? (
          <EmptyState title="לא ניתן לטעון גרסאות" body={q.error?.message} />
        ) : (
          <div className="space-y-4">
            {/* Version chips */}
            <div className="flex flex-wrap gap-1.5">
              {versions.map(v => (
                <button
                  key={v.version}
                  onClick={() => setSelected(v.version)}
                  className={`px-2.5 py-1 rounded-sc-pill text-[12px] font-bold border transition-colors sc-num inline-flex items-center gap-1 ${
                    selected === v.version
                      ? 'bg-sc-primary text-white border-sc-primary'
                      : 'bg-white text-sc-text-secondary border-sc-border hover:border-sc-primary'
                  }`}
                >
                  {v.version}
                  {v.current && (
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        selected === v.version ? 'bg-white' : 'bg-sc-success'
                      }`}
                      title="גרסה פעילה"
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Selected version detail */}
            {active && (
              <VersionDetail
                version={active}
                canEdit={canEdit}
                onSaved={() => q.refetch()}
              />
            )}

            {/* Compare / diff placeholder */}
            <ComparePlaceholder
              versions={versions}
              base={active}
              compareWith={compareWith}
              other={other}
              onPick={setCompareWith}
            />

            {/* Where edits go */}
            <div className="flex items-start gap-2 rounded-sc-input bg-sc-light-blue text-sc-primary px-3 py-2 text-[11.5px]">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>{data.note}</span>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function VersionDetail({
  version,
  canEdit,
  onSaved,
}: {
  version: AiPromptVersion
  canEdit: boolean
  onSaved: () => void
}) {
  const toast = useToast()
  const [text, setText] = useState(version.prompt ?? '')

  // Reset the editor when the selected version changes.
  useEffect(() => { setText(version.prompt ?? '') }, [version.version, version.prompt])

  const editPrompt = trpc.ai.editPrompt.useMutation({
    onSuccess: () => { toast.show('הפרומפט נשמר'); onSaved() },
    onError: e => toast.show(e.message),
  })

  const dirty = text.trim() !== (version.prompt ?? '').trim()

  return (
    <div className="border border-sc-border rounded-sc-card p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[13px] font-bold text-sc-text">
          גרסה {version.version}
          {version.current && <Pill kind="success">פעילה</Pill>}
        </span>
        {version.updated_at && (
          <span className="text-[11px] text-sc-text-muted">עודכן {dateTime(version.updated_at)}</span>
        )}
      </div>

      {version.note && (
        <p className="text-[12px] text-sc-text-secondary m-0 leading-snug">{version.note}</p>
      )}

      {canEdit ? (
        <>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={8}
            dir="ltr"
            placeholder="טקסט הפרומפט עבור גרסה זו…"
            className="w-full bg-sc-bg border border-sc-border rounded-sc-input p-2.5 text-[12px] font-mono outline-none focus:border-sc-primary leading-relaxed text-left"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-sc-text-muted sc-num">{text.length} תווים</span>
            <Button
              size="sm"
              icon={<Save size={14} />}
              disabled={!dirty}
              loading={editPrompt.isLoading}
              onClick={() => editPrompt.mutate({ version: version.version, text })}
            >
              שמור פרומפט
            </Button>
          </div>
        </>
      ) : version.prompt ? (
        <pre
          dir="ltr"
          className="m-0 p-2.5 bg-sc-bg border border-sc-border rounded-sc-input text-[11.5px] text-sc-text-secondary overflow-x-auto max-h-60 leading-relaxed text-left whitespace-pre-wrap"
        >
          {version.prompt}
        </pre>
      ) : (
        <div className="flex items-center gap-2 text-[12px] text-sc-text-muted">
          <Lock size={14} />
          עריכת פרומפטים מוגבלת למנהל-על. אין טקסט שמור לגרסה זו.
        </div>
      )}
    </div>
  )
}

// Compare/diff is a placeholder for now — picking a second version shows a
// side-by-side stub that a future text-diff can fill in.
function ComparePlaceholder({
  versions,
  base,
  compareWith,
  other,
  onPick,
}: {
  versions: AiPromptVersion[]
  base: AiPromptVersion | null
  compareWith: string | null
  other: AiPromptVersion | null
  onPick: (v: string | null) => void
}) {
  return (
    <div className="border border-dashed border-sc-border rounded-sc-card p-3.5 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-sc-text">
        <GitCompare size={15} className="text-sc-gold" />
        השוואת גרסאות
        <Pill kind="neutral">בקרוב</Pill>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-sc-text-secondary">
        <span className="sc-num font-bold">{base?.version ?? '—'}</span>
        <ChevronLeft size={14} className="text-sc-text-muted" />
        <select
          value={compareWith ?? ''}
          onChange={e => onPick(e.target.value || null)}
          className="bg-sc-bg border border-sc-border rounded-sc-input py-1 px-2 text-[12px] sc-num outline-none focus:border-sc-primary"
        >
          <option value="">בחר גרסה להשוואה…</option>
          {versions
            .filter(v => v.version !== base?.version)
            .map(v => (
              <option key={v.version} value={v.version}>
                {v.version}
              </option>
            ))}
        </select>
      </div>

      {other && (
        <div className="grid grid-cols-2 gap-2">
          <DiffSide v={base} />
          <DiffSide v={other} />
        </div>
      )}
      <p className="text-[11px] text-sc-text-muted m-0">
        תצוגת ההבדלים המלאה (diff שורה-אחר-שורה) תתווסף בהמשך — כרגע מוצג טקסט הגרסאות זה לצד זה.
      </p>
    </div>
  )
}

function DiffSide({ v }: { v: AiPromptVersion | null }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-sc-input bg-sc-bg p-2 min-h-[80px]"
    >
      <div className="text-[11px] font-bold text-sc-text mb-1 sc-num">{v?.version ?? '—'}</div>
      <pre
        dir="ltr"
        className="m-0 text-[10.5px] text-sc-text-muted overflow-x-auto max-h-40 leading-relaxed text-left whitespace-pre-wrap"
      >
        {v?.prompt ?? '— אין טקסט שמור —'}
      </pre>
    </motion.div>
  )
}
