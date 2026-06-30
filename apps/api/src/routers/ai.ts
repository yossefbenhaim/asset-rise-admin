import { TRPCError } from '@trpc/server'
import { router, requireAction } from '../trpc.js'
import { audit } from '../lib/audit.js'
import {
  AiResearchKeyInput,
  AiRegenerateInput,
  AiEditPromptInput,
  AiPromptVersionsInput,
  type AiAgent,
  type AiSummaryRow,
  type AiSummaryDetail,
  type AiJobStatus,
  type AiPerspective,
  type AiPromptVersion,
  type AiPromptVersionsResult,
} from '@asset-rise/shared'

// Live version per agent. Analyzer tracks RESEARCH_VERSION in the customer app
// (silver-castle jobs.ts); Wong starts at a v1 baseline. Bump when the matching
// worker's version moves; drives `current` in the prompt-versions panel.
const CURRENT_VERSION: Record<AiAgent, string> = {
  analyzer: 'v10',
  wong: 'v1',
}

// How many versions of history to surface per agent (v1..vN, newest first).
const VERSION_COUNT: Record<AiAgent, number> = {
  analyzer: 10,
  wong: 1,
}

// Short Hebrew note per known version, shown in the versions list. Best-effort;
// unknown versions just show no note.
const VERSION_NOTES: Record<AiAgent, Record<string, string>> = {
  analyzer: {
    v1: 'גרסה ראשונית של מנוע המחקר.',
    v5: 'שיפור זיהוי זכויות בנייה מהתקנון.',
    v8: 'הוספת לוח ה-3 כובעים (שמאי / אדריכל / יזם).',
    v9: 'הציון לא מבוסס על קיום דוח קודם — תיקון הטיה.',
    v10: 'זכויות בנייה סטטוטוריות + חניה לפי תקן, פאנל פרספקטיבות מורחב.',
  },
  wong: {
    v1: 'בסיס אימות מסמכים — התאמת מסמך שהועלה למשימת ה-workflow.',
  },
}

// Read-only description of the engine base prompt for each agent. Shown in the
// panel so it is clear WHAT the override is appended to (the base lives in the
// host worker and is not edited from here).
const BASE_PROMPT_NOTE: Record<AiAgent, string> = {
  analyzer:
    'פרומפט המחקר הדטרמיניסטי חי ב-worker באירוח (analyzer-codex-worker): הוא מורה ל-LLM ' +
    'לאסוף נתונים מהמקורות, לחשב זכויות/כלכלה ולכתוב חוות דעת מובנית (summary_he / opinion_he / ' +
    'פאנל 3 הכובעים). ה-override שנשמר כאן מתווסף לבסיס כ-rubric תחום ב-fences.',
  wong:
    'פרומפט אימות המסמכים חי ב-worker באירוח (document-verify-worker): הוא מורה ל-LLM לבדוק האם ' +
    'המסמך שהועלה אכן תואם למסמך שמשימת ה-workflow מבקשת, ולהחזיר verdict ' +
    '{ approved, reason_he, confidence }. ה-override שנשמר כאן מתווסף לבסיס כ-rubric תחום ב-fences.',
}

// The ACTUAL base prompt each host worker runs, mirrored here so the admin can
// SHOW it (the container can't read the host worker scripts at runtime). These
// are the static instruction bodies of build_prompt() in
// ~/analyzer-codex-worker.sh and ~/document-verify-worker.sh — {…} marks where
// per-request data is injected. Keep in sync if a worker's prompt changes.
const BASE_PROMPT: Record<AiAgent, string> = {
  analyzer: [
    'נתוני הנכס: {עיר, רחוב, מספר, גוש, חלקה, שטח מגרש, שכונה}',
    '',
    '=== הדוח הדטרמיניסטי שלנו ===',
    '{report_context — הציון, הפוטנציאל, 9 הקטגוריות, התנאים, השכונה}',
    '',
    '=== תכניות חופפות (MAVAT) ===',
    '{covering_plans}',
    '',
    '=== מתחמי התחדשות בעיר (רשות ההתחדשות הממשלתית) ===',
    '{complexes}',
    '',
    '=== דוסייה מחקרי (תקנוני תב"ע ודפי מדיניות שחולצו עבורך) ===',
    '{dossier}',
    '',
    '=== המשימה ===',
    'לפני הכל — קרא וקלוט את כל מה שקיבלת: הדוח הדטרמיניסטי שלנו (ציון, פוטנציאל, 9 קטגוריות, תנאים, שכונה), כל התכניות החופפות, רשימת מתחמי ההתחדשות בעיר (שים לב במיוחד למתחמים עם היתרים שכבר הוצאו או שמסומנים in_execution, ולמתחם שמסומן street_match=true — הוא על שם הרחוב של הנכס; אלה אינדיקציות חזקות להתקדמות), וכל הדוסייה. רק אחר כך גבש עמדה.',
    '(א) חלץ זכויות לחלקה הזו בלבד. (ב) opinion_he — חוות דעת מורחבת כמו שמאי שמדבר עם בעל הדירה: סכם בנינוחות מה מצאנו אנחנו (הציון, הפוטנציאל, החוזקות והחולשות), מה גילית באינטרנט, ומה המסקנה והצעד המעשי הבא. פסקה של 4-7 משפטים בשפה פשוטה. (ג) score_opinion — בכמה נקודות הממצאים שלך צריכים לשנות את הציון של המנוע? תן delta מספר שלם בין -20 ל-20, direction תואם, ו-reason_he. (ד) perspectives — פאנל של שלוש חוות דעת (שמאי / אדריכל / יזם), לכל אחת rating 0-100, stance, opinion_he ו-key_point_he. ה-ratings אינדיקטיביים בלבד ואינם משנים את ציון הבדיקה.',
    '',
    'החזר JSON אחד בלבד, בלי טקסט נוסף ובלי code fence, לפי הסכמה:',
    '{ density_per_dunam, rights_pct, preservation, parking_note, parking_per_unit, named_complex, summary_he, opinion_he, score_opinion:{direction,delta,reason_he}, sources, confidence, takanon_rights:{…}|null, perspectives:[{role,rating,stance,opinion_he,key_point_he} ×3] }',
    '',
    'כללים: שפה פשוטה (מונחים מקצועיים + הסבר קצר בסוגריים בפעם הראשונה). השתמש רק בתכנית שמכסה את הכתובת הזו. אל תמציא מספרים — אם אין תמיכה לחלקה, null + confidence נמוך (אבל opinion_he ו-score_opinion תמיד מלאים בעברית). takanon_rights — חלץ זכויות מהתקנון הסטטוטורי בלבד (לא מדפי פרסום). קריטי: אל תוריד ציון בגלל "החלקה לא במתחם" — ההכרעה אם החלקה כלולה נעשית אצלנו, דטרמיניסטית, מתוך parcels; ב-notes_he וב-opinion_he נסח על המתחם והאזור, בלי לנקוב במספר חלקה ספציפי.',
  ].join('\n'),
  wong: [
    'המשימה: "{כותרת משימת ה-workflow}". המסמך המבוקש: "{תווית המסמך}".',
    'להלן הטקסט שחולץ מהקובץ שהועלה (ייתכן חלקי):',
    '---',
    '{טקסט שחולץ מהקובץ — או "(לא חולץ טקסט מהקובץ)"}',
    '---',
    'תפקידך היחיד: לקבוע האם הקובץ הוא מהסוג/הנושא הנכון של המסמך המבוקש. התעלם לחלוטין מהשאלה אם המסמך חתום, מלא, או תקף משפטית — גם אם שדות ריקים, חסרה חתימה, או חסרים פרטים: אם זה הסוג הנכון של מסמך עם הנושא הנכון, approved=true. approved=false רק אם הטקסט ריק לגמרי, או שזה מסמך אחר לגמרי / תמונה אקראית שאינה קשורה למבוקש.',
    'החזר אך ורק JSON תקין, בלי טקסט נוסף ובלי code fence:',
    '{"approved": true|false, "reason_he": "משפט קצר בעברית", "confidence": "high"|"medium"|"low"}',
  ].join('\n'),
}

// Composition note (where edits go + how the worker consumes them) per agent.
const COMPOSE_NOTE: Record<AiAgent, string> = {
  analyzer:
    'פרומפט המחקר הבסיסי מוגדר ב-worker באירוח ואינו נערך מכאן. ה-override שנערך כאן ' +
    'נשמר לטבלת sc_ai_prompts (agent=analyzer, service-role בלבד), מתווסף לבסיס כ-rubric תחום ב-fences, ' +
    'וה-worker קורא אותו בריצה הבאה. השינוי אינו מפיל גרסה חדשה אוטומטית.',
  wong:
    'פרומפט אימות המסמכים הבסיסי מוגדר ב-worker באירוח ואינו נערך מכאן. ה-override שנערך כאן ' +
    'נשמר לטבלת sc_ai_prompts (agent=wong, service-role בלבד), מתווסף לבסיס כ-rubric תחום ב-fences, ' +
    'וה-worker קורא אותו בריצה הבאה. השינוי אינו מפיל גרסה חדשה אוטומטית.',
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

  // Per-agent version history (v1..current) + any stored editable OVERRIDE text
  // per version from sc_ai_prompts, filtered by `agent`. Returns the override
  // text so the UI can SHOW each version's actual prompt content.
  promptVersions: requireAction('admin.ai.view')
    .input(AiPromptVersionsInput)
    .query(async ({ ctx, input }): Promise<AiPromptVersionsResult> => {
      const agent = input.agent
      const current = CURRENT_VERSION[agent]
      const count = VERSION_COUNT[agent]
      const notes = VERSION_NOTES[agent]

      const { data: stored } = await ctx.db
        .from('sc_ai_prompts')
        .select('version,text,note,updated_by,updated_at')
        .eq('agent', agent)
      const byVersion = new Map<
        string,
        { text: string | null; note: string | null; updated_by: string | null; updated_at: string | null }
      >()
      for (const s of (stored ?? []) as any[]) {
        byVersion.set(s.version as string, {
          text: str(s.text),
          note: str(s.note),
          updated_by: (s.updated_by as string | null) ?? null,
          updated_at: (s.updated_at as string | null) ?? null,
        })
      }

      const versions: AiPromptVersion[] = []
      for (let n = count; n >= 1; n--) {
        const v = `v${n}`
        const s = byVersion.get(v)
        versions.push({
          version: v,
          current: v === current,
          note: s?.note ?? notes[v] ?? null,
          prompt: s?.text ?? null,
          hasOverride: !!s?.text,
          base_note: BASE_PROMPT_NOTE[agent],
          updated_by: s?.updated_by ?? null,
          updated_at: s?.updated_at ?? null,
        })
      }

      return {
        agent,
        current,
        versions,
        basePrompt: BASE_PROMPT[agent],
        note: COMPOSE_NOTE[agent],
      }
    }),

  // Edit a version's prompt → upsert into sc_ai_prompts (read by host worker),
  // scoped per agent. Super-only via admin.ai.edit_prompt.
  editPrompt: requireAction('admin.ai.edit_prompt')
    .input(AiEditPromptInput)
    .mutation(async ({ ctx, input }): Promise<{ agent: AiAgent; version: string }> => {
      const { error } = await ctx.db
        .from('sc_ai_prompts')
        .upsert(
          {
            agent: input.agent,
            version: input.version,
            text: input.text,
            note: input.note ?? null,
            updated_by: ctx.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'agent,version' },
        )
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      await audit(ctx.db, {
        actor_id: ctx.user.id,
        action: 'ai.edit_prompt',
        target_type: 'ai_prompt',
        target_id: `${input.agent}:${input.version}`,
        meta: { agent: input.agent, version: input.version, len: input.text.length, has_note: !!input.note },
        ip: ctx.ip,
      })
      return { agent: input.agent, version: input.version }
    }),
})
