// Per-agent prompt-version history panel (Analyzer | Wong). The goal is to make
// it obvious to Yossef WHAT changed between versions and WHAT the prompt
// actually is. Clicking any version reveals its FULL prompt content:
//
//   • Each version is listed (current highlighted) with its human note + the
//     stored OVERRIDE text from sc_ai_prompts, if any. No stored text → the
//     engine base-prompt note is shown instead ("גרסת מנוע — אין override מותאם").
//   • A read-only "base prompt" explainer makes clear the real prompt lives in
//     the HOST worker; the text edited here is APPENDED to it as a fenced
//     rubric (it does not replace the base prompt).
//   • Super-admins (admin.ai.edit_prompt) get the edit box; everyone else sees
//     the stored override read-only.
//   • A real side-by-side compare lets two versions be read against each other.
//
// Parameterized by `agent` so the SAME UI serves both the analyzer and Wong.
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  History, GitCompare, Lock, Save, Info, Layers, FileCode2, Server,
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
import type { AiAgent, AiPromptVersion } from '@asset-rise/shared'

export function PromptVersionsPanel({ agent }: { agent: AiAgent }) {
  const roleKeys = useRoleKeys()
  const canEdit = can(roleKeys, 'admin.ai.edit_prompt')
  const q = trpc.ai.promptVersions.useQuery({ agent }, { refetchOnWindowFocus: false })
  const data = q.data

  const [selected, setSelected] = useState<string | null>(null)
  const [compareWith, setCompareWith] = useState<string | null>(null)

  // Reset selection when switching agents.
  useEffect(() => { setSelected(null); setCompareWith(null) }, [agent])

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
            {/* How the prompt is composed (base in worker + override here) */}
            <div className="flex items-start gap-2 rounded-sc-input bg-sc-light-blue text-sc-primary px-3 py-2.5 text-[11.5px] leading-relaxed">
              <Layers size={15} className="shrink-0 mt-0.5" />
              <span>
                <b>פרומפט המנוע הבסיסי</b> חי ב-worker באירוח (לא נערך מכאן).
                הטקסט שנערך כאן הוא <b>override</b> שמתווסף לבסיס כ-<span dir="ltr" className="font-mono">rubric</span> תחום
                ב-fences, ונקרא ע״י ה-worker בריצה הבאה. השינוי אינו מפיל גרסה חדשה אוטומטית.
              </span>
            </div>

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
                  title={v.current ? 'גרסה פעילה' : undefined}
                >
                  {v.version}
                  {v.current && (
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        selected === v.version ? 'bg-white' : 'bg-sc-success'
                      }`}
                    />
                  )}
                  {v.hasOverride && (
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-sm ${
                        selected === v.version ? 'bg-white/80' : 'bg-sc-gold'
                      }`}
                      title="קיים override מותאם"
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Selected version detail */}
            {active && (
              <VersionDetail
                agent={agent}
                version={active}
                basePrompt={data.basePrompt}
                canEdit={canEdit}
                onSaved={() => q.refetch()}
              />
            )}

            {/* Real side-by-side compare */}
            <CompareVersions
              versions={versions}
              base={active}
              compareWith={compareWith}
              other={other}
              onPick={setCompareWith}
            />

            {/* Where edits go (server note) */}
            <div className="flex items-start gap-2 rounded-sc-input bg-sc-bg text-sc-text-secondary px-3 py-2 text-[11px] leading-relaxed">
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
  agent,
  version,
  basePrompt,
  canEdit,
  onSaved,
}: {
  agent: AiAgent
  version: AiPromptVersion
  basePrompt: string
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
  const hasOverride = version.hasOverride

  return (
    <div className="border border-sc-border rounded-sc-card p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="inline-flex items-center gap-2 text-[13px] font-bold text-sc-text">
          גרסה {version.version}
          {version.current && <Pill kind="success">פעילה</Pill>}
          {hasOverride ? <Pill kind="gold">override מותאם</Pill> : <Pill kind="neutral">מנוע בלבד</Pill>}
        </span>
        {version.updated_at && (
          <span className="text-[11px] text-sc-text-muted">עודכן {dateTime(version.updated_at)}</span>
        )}
      </div>

      {version.note && (
        <p className="text-[12px] text-sc-text-secondary m-0 leading-snug">{version.note}</p>
      )}

      {/* The ACTUAL base prompt the worker runs right now — read-only, full
          text (not just a note), so it's clear exactly what the agent runs on. */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-sc-text-muted">
          <Server size={13} className="text-sc-primary" />
          הפרומפט שרץ בפועל (פרומפט המנוע)
        </div>
        <pre
          dir="rtl"
          className="m-0 p-2.5 bg-sc-bg border border-sc-border rounded-sc-input text-[11.5px] text-sc-text-secondary overflow-auto max-h-72 leading-relaxed whitespace-pre-wrap"
        >
          {basePrompt}
        </pre>
        <p className="text-[10.5px] text-sc-text-muted m-0 leading-snug">{version.base_note}</p>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] font-bold text-sc-text-muted">
        <FileCode2 size={13} className="text-sc-primary" />
        פרומפט חדש / חידוד (override שמתווסף לבסיס כ-rubric)
      </div>

      {canEdit ? (
        <>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={8}
            dir="ltr"
            placeholder="טקסט ה-override עבור גרסה זו… (יתווסף לפרומפט הבסיס כ-rubric)"
            className="w-full bg-sc-bg border border-sc-border rounded-sc-input p-2.5 text-[12px] font-mono outline-none focus:border-sc-primary leading-relaxed text-left"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-sc-text-muted sc-num">
              {text.length} תווים{!hasOverride && ' · אין override שמור עדיין'}
            </span>
            <Button
              size="sm"
              icon={<Save size={14} />}
              disabled={!dirty}
              loading={editPrompt.isLoading}
              onClick={() => editPrompt.mutate({ agent, version: version.version, text })}
            >
              שמור override
            </Button>
          </div>
        </>
      ) : hasOverride ? (
        <pre
          dir="ltr"
          className="m-0 p-2.5 bg-sc-bg border border-sc-border rounded-sc-input text-[11.5px] text-sc-text-secondary overflow-x-auto max-h-60 leading-relaxed text-left whitespace-pre-wrap"
        >
          {version.prompt}
        </pre>
      ) : (
        <div className="flex items-center gap-2 text-[12px] text-sc-text-muted rounded-sc-input bg-sc-bg px-2.5 py-2">
          <Lock size={14} className="shrink-0" />
          גרסת מנוע — אין override מותאם
        </div>
      )}
    </div>
  )
}

// Side-by-side comparison: pick a second version and read both prompts (or the
// "engine-only" note) against each other. Notes shown above each text.
function CompareVersions({
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
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-sc-text-secondary">
        <Pill kind="navy">{base?.version ?? '—'}</Pill>
        <span className="text-sc-text-muted">מול</span>
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
                {v.version}{v.hasOverride ? ' · override' : ' · מנוע'}
              </option>
            ))}
        </select>
      </div>

      {other ? (
        <div className="grid grid-cols-2 gap-2">
          <DiffSide v={base} />
          <DiffSide v={other} />
        </div>
      ) : (
        <p className="text-[11px] text-sc-text-muted m-0">
          בחר גרסה להשוואה כדי לראות את שני הטקסטים זה לצד זה.
        </p>
      )}
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
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[11px] font-bold text-sc-text sc-num">{v?.version ?? '—'}</span>
        {v?.current && <Pill kind="success">פעילה</Pill>}
        {v && !v.hasOverride && <Pill kind="neutral">מנוע</Pill>}
      </div>
      {v?.note && <p className="text-[10.5px] text-sc-text-secondary m-0 mb-1 leading-snug">{v.note}</p>}
      {v?.hasOverride ? (
        <pre
          dir="ltr"
          className="m-0 text-[10.5px] text-sc-text-muted overflow-x-auto max-h-40 leading-relaxed text-left whitespace-pre-wrap"
        >
          {v.prompt}
        </pre>
      ) : (
        <div className="text-[10.5px] text-sc-text-muted leading-relaxed">
          גרסת מנוע — אין override מותאם.
          {v?.base_note && <span className="block mt-1">{v.base_note}</span>}
        </div>
      )}
    </motion.div>
  )
}
