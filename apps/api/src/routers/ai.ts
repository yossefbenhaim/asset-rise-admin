import { TRPCError } from '@trpc/server'
import { router, requireAction } from '../trpc.js'
import { audit } from '../lib/audit.js'
import {
  AiResearchKeyInput,
  AiRegenerateInput,
  AiEditPromptInput,
  type AiSummaryRow,
  type AiSummaryDetail,
  type AiJobStatus,
  type AiPerspective,
  type AiPromptVersion,
  type AiPromptVersionsResult,
} from '@asset-rise/shared'

// Live RESEARCH_VERSION in the customer app (silver-castle jobs.ts). Bump when
// the worker's version moves; drives `current` in the prompt-versions panel.
const CURRENT_VERSION = 'v10'

// Short Hebrew note per known version, shown in the versions list. Best-effort;
// unknown versions just show no note.
const VERSION_NOTES: Record<string, string> = {
  v1: 'גרסה ראשונית של מנוע המחקר.',
  v5: 'שיפור זיהוי זכויות בנייה מהתקנון.',
  v8: 'הוספת לוח ה-3 כובעים (שמאי / אדריכל / יזם).',
  v9: 'הציון לא מבוסס על קיום דוח קודם — תיקון הטיה.',
  v10: 'זכויות בנייה סטטוטוריות + חניה לפי תקן, פאנל פרספקטיבות מורחב.',
}

// ── jsonb extraction helpers ────────────────────────────────────────────
function obj(v: unknown): Record<string, any> | null {
  return v && typeof v === 'object' ? (v as Record<string, any>) : null
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

// research_key looks like "v10::haifa::g:1234" — leading segment is the version.
function versionOf(researchKey: string | null): string | null {
  if (!researchKey) return null
  const head = researchKey.split('::')[0]?.trim()
  return head && /^v\d{1,3}$/.test(head) ? head : null
}

// Model id, if the job recorded one (request.model / result.model / *_used).
function modelOf(request: unknown, result: unknown): string | null {
  const rq = obj(request)
  const rs = obj(result)
  return (
    str(rq?.model) ?? str(rq?.model_id) ?? str(rs?.model) ?? str(rs?.model_used) ?? null
  )
}

// Best-effort headline + longer summary out of the AiResearch result jsonb.
function summarize(result: unknown): { heading: string | null; summary: string | null } {
  const r = obj(result)
  if (!r) return { heading: null, summary: null }
  const heading = str(r.heading) ?? str(r.summary_he) ?? null
  const summary = str(r.opinion_he) ?? str(r.summary_he) ?? str(r.heading) ?? null
  return { heading, summary }
}

function jobStatus(status: string | null | undefined): AiJobStatus {
  switch (status) {
    case 'running': return 'running'
    case 'failed': return 'failed'
    case 'done': return 'done'
    default: return 'pending'
  }
}

function perspectivesOf(result: unknown): AiPerspective[] {
  const r = obj(result)
  const arr = Array.isArray(r?.perspectives) ? r!.perspectives : []
  return arr
    .map((p: any): AiPerspective => ({
      role: str(p?.role) ?? 'unknown',
      rating: typeof p?.rating === 'number' ? p.rating : null,
      stance: str(p?.stance),
      opinion_he: str(p?.opinion_he),
      key_point_he: str(p?.key_point_he),
    }))
    .filter(p => p.opinion_he || p.rating != null)
}

export const aiRouter = router({
  // Recent analyzer jobs that produced a result → flattened AI summaries.
  list: requireAction('admin.ai.view').query(async ({ ctx }): Promise<AiSummaryRow[]> => {
    const { data, error } = await ctx.db
      .from('sc_analyzer_jobs')
      .select('research_key,status,request,result,error,attempts,created_at,updated_at,completed_at')
      .not('result', 'is', null)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(500)
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

    return (data ?? []).map((j): AiSummaryRow => {
      const rk = (j.research_key as string | null) ?? ''
      const { heading, summary } = summarize(j.result)
      const r = obj(j.result)
      return {
        research_key: rk,
        status: jobStatus(j.status as string | null),
        version: versionOf(rk),
        model: modelOf(j.request, j.result),
        heading,
        summary,
        confidence: str(r?.confidence),
        has_perspectives: perspectivesOf(j.result).length > 0,
        attempts: typeof j.attempts === 'number' ? j.attempts : null,
        created_at: j.created_at as string,
        updated_at: (j.updated_at as string | null) ?? null,
        completed_at: (j.completed_at as string | null) ?? null,
        error: (j.error as string | null) ?? null,
      }
    })
  }),

  // Full detail for the drawer: flattened fields + the raw request/result blobs.
  get: requireAction('admin.ai.view')
    .input(AiResearchKeyInput)
    .query(async ({ ctx, input }): Promise<AiSummaryDetail> => {
      const { data, error } = await ctx.db
        .from('sc_analyzer_jobs')
        .select('research_key,status,request,result,error,attempts,created_at,updated_at,completed_at')
        .eq('research_key', input.research_key)
        .maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      if (!data) throw new TRPCError({ code: 'NOT_FOUND', message: 'עבודת AI לא נמצאה' })

      const rk = (data.research_key as string | null) ?? ''
      const { heading, summary } = summarize(data.result)
      const r = obj(data.result)
      return {
        research_key: rk,
        status: jobStatus(data.status as string | null),
        version: versionOf(rk),
        model: modelOf(data.request, data.result),
        heading,
        summary,
        confidence: str(r?.confidence),
        has_perspectives: perspectivesOf(data.result).length > 0,
        attempts: typeof data.attempts === 'number' ? data.attempts : null,
        created_at: data.created_at as string,
        updated_at: (data.updated_at as string | null) ?? null,
        completed_at: (data.completed_at as string | null) ?? null,
        error: (data.error as string | null) ?? null,
        perspectives: perspectivesOf(data.result),
        recommendations: Array.isArray(r?.recommendations)
          ? (r!.recommendations as any[]).map(String).filter(Boolean)
          : [],
        sources: Array.isArray(r?.sources)
          ? (r!.sources as any[]).map(String).filter(Boolean)
          : [],
        request: data.request,
        result: data.result,
      }
    }),

  // Re-run the AI for this key: reset the job to 'pending' so the host worker
  // picks it up again. Clears the prior result/error.
  regenerate: requireAction('admin.ai.regenerate')
    .input(AiRegenerateInput)
    .mutation(async ({ ctx, input }): Promise<{ research_key: string }> => {
      const { data: existing, error } = await ctx.db
        .from('sc_analyzer_jobs')
        .select('id,request')
        .eq('research_key', input.research_key)
        .maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      if (!existing?.id) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'עבודת AI לא נמצאה' })
      }
      const req = obj(existing.request) ? { ...(existing.request as Record<string, unknown>) } : {}
      ;(req as Record<string, unknown>)._admin_ai_regen = { at: new Date().toISOString() }

      const { error: upErr } = await ctx.db
        .from('sc_analyzer_jobs')
        .update({ status: 'pending', error: null, result: null, request: req })
        .eq('id', existing.id)
      if (upErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: upErr.message })

      await audit(ctx.db, {
        actor_id: ctx.user.id,
        action: 'ai.regenerate',
        target_type: 'analyzer_job',
        target_id: input.research_key,
        meta: { research_key: input.research_key },
        ip: ctx.ip,
      })
      return { research_key: input.research_key }
    }),

  // Known RESEARCH_VERSION history (v1..current) + any stored editable prompt
  // text per version from sc_ai_prompts. Stub list — the source of truth for the
  // live version is CURRENT_VERSION above.
  promptVersions: requireAction('admin.ai.view').query(
    async ({ ctx }): Promise<AiPromptVersionsResult> => {
      const currentNum = Number(CURRENT_VERSION.replace(/^v/, '')) || 10
      const { data: stored } = await ctx.db
        .from('sc_ai_prompts')
        .select('version,text,note,updated_at')
      const byVersion = new Map<string, { text: string | null; note: string | null; updated_at: string | null }>()
      for (const s of (stored ?? []) as any[]) {
        byVersion.set(s.version as string, {
          text: str(s.text),
          note: str(s.note),
          updated_at: (s.updated_at as string | null) ?? null,
        })
      }

      const versions: AiPromptVersion[] = []
      for (let n = currentNum; n >= 1; n--) {
        const v = `v${n}`
        const s = byVersion.get(v)
        versions.push({
          version: v,
          current: v === CURRENT_VERSION,
          note: s?.note ?? VERSION_NOTES[v] ?? null,
          prompt: s?.text ?? null,
          updated_at: s?.updated_at ?? null,
        })
      }

      return {
        current: CURRENT_VERSION,
        versions,
        note:
          'פרומפט המחקר הבסיסי מוגדר ב-worker באירוח ואינו נערך מכאן. ה-override שנערך כאן ' +
          'נשמר לטבלת sc_ai_prompts (service-role בלבד), מתווסף לבסיס כ-rubric תחום ב-fences, ' +
          'וה-worker קורא אותו בריצה הבאה. השינוי אינו מפיל גרסה חדשה אוטומטית.',
      }
    },
  ),

  // Edit a version's prompt → upsert into sc_ai_prompts (read by host worker).
  // Super-only via admin.ai.edit_prompt.
  editPrompt: requireAction('admin.ai.edit_prompt')
    .input(AiEditPromptInput)
    .mutation(async ({ ctx, input }): Promise<{ version: string }> => {
      const { error } = await ctx.db
        .from('sc_ai_prompts')
        .upsert(
          {
            version: input.version,
            text: input.text,
            note: input.note ?? null,
            updated_by: ctx.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'version' },
        )
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      await audit(ctx.db, {
        actor_id: ctx.user.id,
        action: 'ai.edit_prompt',
        target_type: 'ai_prompt',
        target_id: input.version,
        meta: { version: input.version, len: input.text.length, has_note: !!input.note },
        ip: ctx.ip,
      })
      return { version: input.version }
    }),
})
