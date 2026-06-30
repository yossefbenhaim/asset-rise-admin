import { TRPCError } from '@trpc/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { router, requireAction } from '../trpc.js'
import { audit } from '../lib/audit.js'
import {
  ReportTokenInput,
  RerunReportInput,
  UpdateReportFieldsInput,
  SetReportFlagInput,
  type ReportRow,
  type ReportDetail,
  type ReportStatus,
  type ReportJob,
  type ReportFlag,
} from '@asset-rise/shared'

// ── jsonb extraction helpers ────────────────────────────────────────────
// The `report` column is the customer app's full EvaluateResponse. We only
// reach for a few fields and stay defensive (older rows / partial jsonb).
function rget(report: unknown): Record<string, any> | null {
  return report && typeof report === 'object' ? (report as Record<string, any>) : null
}
function cityOf(report: unknown, addressKey: string | null): string | null {
  const r = rget(report)
  const c = r?.address?.city
  if (typeof c === 'string' && c.trim()) return c
  // address_key looks like "<city>::..." — take the leading segment as a fallback.
  if (addressKey) {
    const head = addressKey.split('::')[0]?.trim()
    if (head) return head
  }
  return null
}
function gushOf(report: unknown): number | null {
  const g = rget(report)?.address?.gush
  return typeof g === 'number' ? g : null
}
function helkaOf(report: unknown): number | null {
  // EvaluateResponse spells it `chelka`.
  const h = rget(report)?.address?.chelka
  return typeof h === 'number' ? h : null
}
// research_key for re-enqueue: lives on the persisted ai job view inside the jsonb.
function researchKeyOf(report: unknown): string | null {
  const k = rget(report)?.ai?.key
  return typeof k === 'string' && k.trim() ? k : null
}

// Map a sc_analyzer_jobs.status to the admin ReportStatus vocabulary.
function jobStatusToReport(status: string | null | undefined): ReportStatus {
  switch (status) {
    case 'running': return 'processing'
    case 'failed': return 'failed'
    case 'pending': return 'queued'
    case 'done': return 'completed'
    default: return 'queued'
  }
}

// Load the matching job row by research_key (or null when none / no key).
async function loadJob(db: SupabaseClient, researchKey: string | null): Promise<ReportJob | null> {
  if (!researchKey) return null
  const { data } = await db
    .from('sc_analyzer_jobs')
    .select('id,research_key,status,error,attempts,updated_at,completed_at')
    .eq('research_key', researchKey)
    .maybeSingle()
  if (!data) return null
  return {
    id: (data.id as string) ?? null,
    research_key: (data.research_key as string) ?? null,
    status: (data.status as ReportJob['status']) ?? 'pending',
    error: (data.error as string) ?? null,
    attempts: (data.attempts as number) ?? null,
    updated_at: (data.updated_at as string) ?? null,
    completed_at: (data.completed_at as string) ?? null,
  }
}

// Re-enqueue (or reset) the research job for a key → status 'pending'. Upserts
// so a brand-new key still gets a row. `aiOnly` is stamped in request meta so
// the worker can pick a lighter refresh path; both go through the same queue.
async function enqueueResearch(
  db: SupabaseClient,
  researchKey: string,
  aiOnly: boolean,
): Promise<void> {
  const { data: existing } = await db
    .from('sc_analyzer_jobs')
    .select('id,request')
    .eq('research_key', researchKey)
    .maybeSingle()

  if (existing?.id) {
    const req = (existing.request && typeof existing.request === 'object')
      ? { ...(existing.request as Record<string, unknown>) }
      : {}
    req._admin_rerun = { ai_only: aiOnly, at: new Date().toISOString() }
    const { error } = await db
      .from('sc_analyzer_jobs')
      .update({ status: 'pending', error: null, result: null, request: req })
      .eq('id', existing.id)
    if (error) throw error
    return
  }

  const { error } = await db
    .from('sc_analyzer_jobs')
    .insert({
      research_key: researchKey,
      status: 'pending',
      request: { _admin_rerun: { ai_only: aiOnly, at: new Date().toISOString() } },
    })
  if (error && !/duplicate|unique|conflict/i.test(error.message)) throw error
}

export const reportsRouter = router({
  // Full list for the DataTable. Newest first; flattened + joined.
  list: requireAction('admin.reports.list').query(async ({ ctx }): Promise<ReportRow[]> => {
    const { data: reports, error } = await ctx.db
      .from('sc_analyzer_reports')
      .select('token,address_key,address_display,score,report,created_at,accessed_at,lead_name,lead_email')
      .order('created_at', { ascending: false })
      .limit(1000)
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    const rows = reports ?? []

    // Bulk side-loads: which lead emails paid, which tokens are pinned, and the
    // running/failed jobs (to derive status for rows without a persisted report).
    const emails = Array.from(
      new Set(rows.map(r => (r.lead_email as string | null)?.toLowerCase()).filter(Boolean) as string[]),
    )
    const tokens = rows.map(r => r.token as string)
    const researchKeys = Array.from(
      new Set(rows.map(r => researchKeyOf(r.report)).filter(Boolean) as string[]),
    )

    const [paidRes, flagRes, jobRes] = await Promise.all([
      emails.length
        ? ctx.db.from('sc_payments').select('lead_email').eq('status', 'paid').in('lead_email', emails)
        : Promise.resolve({ data: [] as { lead_email: string | null }[] }),
      tokens.length
        ? ctx.db.from('sc_report_flags').select('report_token,pinned').in('report_token', tokens)
        : Promise.resolve({ data: [] as { report_token: string; pinned: boolean }[] }),
      researchKeys.length
        ? ctx.db.from('sc_analyzer_jobs').select('research_key,status').in('research_key', researchKeys)
        : Promise.resolve({ data: [] as { research_key: string; status: string }[] }),
    ])

    const paidSet = new Set(
      ((paidRes.data ?? []) as { lead_email: string | null }[])
        .map(p => p.lead_email?.toLowerCase())
        .filter(Boolean) as string[],
    )
    const pinnedSet = new Set(
      ((flagRes.data ?? []) as { report_token: string; pinned: boolean }[])
        .filter(f => f.pinned)
        .map(f => f.report_token),
    )
    const jobStatusByKey = new Map<string, string>()
    for (const j of (jobRes.data ?? []) as { research_key: string; status: string }[]) {
      jobStatusByKey.set(j.research_key, j.status)
    }

    return rows.map((r): ReportRow => {
      const hasReport = !!rget(r.report)
      const rk = researchKeyOf(r.report)
      const status: ReportStatus = hasReport
        ? 'completed'
        : jobStatusToReport(rk ? jobStatusByKey.get(rk) : undefined)
      const email = (r.lead_email as string | null)?.toLowerCase() ?? null
      return {
        token: r.token as string,
        address_display: (r.address_display as string | null) ?? null,
        city: cityOf(r.report, (r.address_key as string | null) ?? null),
        gush: gushOf(r.report),
        helka: helkaOf(r.report),
        score: typeof r.score === 'number' ? r.score : null,
        status,
        created_at: r.created_at as string,
        accessed_at: (r.accessed_at as string | null) ?? null,
        lead_name: (r.lead_name as string | null) ?? null,
        lead_email: (r.lead_email as string | null) ?? null,
        paid: email ? paidSet.has(email) : false,
        pinned: pinnedSet.has(r.token as string),
      }
    })
  }),

  // Full detail for the drawer: report jsonb + matching job + flag + paid.
  get: requireAction('admin.reports.list')
    .input(ReportTokenInput)
    .query(async ({ ctx, input }): Promise<ReportDetail> => {
      const { data: row, error } = await ctx.db
        .from('sc_analyzer_reports')
        .select('token,address_key,address_display,score,report,created_at,accessed_at,lead_name,lead_phone,lead_email')
        .eq('token', input.token)
        .maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'דוח לא נמצא' })

      const rk = researchKeyOf(row.report)
      const [job, flagRes, paidRes] = await Promise.all([
        loadJob(ctx.db, rk),
        ctx.db
          .from('sc_report_flags')
          .select('report_token,admin_id,pinned,note,updated_at')
          .eq('report_token', input.token)
          .maybeSingle(),
        (row.lead_email as string | null)
          ? ctx.db
              .from('sc_payments')
              .select('id')
              .eq('status', 'paid')
              .ilike('lead_email', row.lead_email as string)
              .limit(1)
          : Promise.resolve({ data: [] as { id: string }[] }),
      ])

      const flag: ReportFlag | null = flagRes.data
        ? {
            report_token: flagRes.data.report_token as string,
            admin_id: (flagRes.data.admin_id as string | null) ?? null,
            pinned: !!flagRes.data.pinned,
            note: (flagRes.data.note as string | null) ?? null,
            updated_at: (flagRes.data.updated_at as string | null) ?? null,
          }
        : null

      const hasReport = !!rget(row.report)
      const status: ReportStatus = hasReport
        ? 'completed'
        : jobStatusToReport(job?.status === 'completed' ? 'done' : job?.status)

      return {
        token: row.token as string,
        address_display: (row.address_display as string | null) ?? null,
        address_key: (row.address_key as string | null) ?? null,
        city: cityOf(row.report, (row.address_key as string | null) ?? null),
        gush: gushOf(row.report),
        helka: helkaOf(row.report),
        score: typeof row.score === 'number' ? row.score : null,
        status,
        created_at: row.created_at as string,
        accessed_at: (row.accessed_at as string | null) ?? null,
        lead_name: (row.lead_name as string | null) ?? null,
        lead_phone: (row.lead_phone as string | null) ?? null,
        lead_email: (row.lead_email as string | null) ?? null,
        paid: ((paidRes.data ?? []) as { id: string }[]).length > 0,
        research_key: rk,
        report: row.report,
        job,
        flag,
      }
    }),

  // Full re-run: re-enqueue the report's research job to 'pending'.
  rerun: requireAction('admin.reports.rerun')
    .input(RerunReportInput)
    .mutation(async ({ ctx, input }): Promise<{ research_key: string }> => {
      const { data: row, error } = await ctx.db
        .from('sc_analyzer_reports')
        .select('report')
        .eq('token', input.token)
        .maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'דוח לא נמצא' })
      const rk = researchKeyOf(row.report)
      if (!rk) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'לדוח אין מפתח מחקר (research_key) — לא ניתן להריץ מחדש',
        })
      }
      try {
        await enqueueResearch(ctx.db, rk, !!input.ai_only)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
      await audit(ctx.db, {
        actor_id: ctx.user.id,
        action: input.ai_only ? 'report.regenerate_ai' : 'report.rerun',
        target_type: 'report',
        target_id: input.token,
        meta: { research_key: rk, ai_only: !!input.ai_only },
        ip: ctx.ip,
      })
      return { research_key: rk }
    }),

  // AI-only refresh — same queue, marked ai_only. Separate proc so the page can
  // wire its own button + the audit action stays distinct.
  regenerateAi: requireAction('admin.reports.rerun')
    .input(ReportTokenInput)
    .mutation(async ({ ctx, input }): Promise<{ research_key: string }> => {
      const { data: row, error } = await ctx.db
        .from('sc_analyzer_reports')
        .select('report')
        .eq('token', input.token)
        .maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'דוח לא נמצא' })
      const rk = researchKeyOf(row.report)
      if (!rk) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'לדוח אין מפתח מחקר (research_key) — לא ניתן לרענן AI',
        })
      }
      try {
        await enqueueResearch(ctx.db, rk, true)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
      await audit(ctx.db, {
        actor_id: ctx.user.id,
        action: 'report.regenerate_ai',
        target_type: 'report',
        target_id: input.token,
        meta: { research_key: rk },
        ip: ctx.ip,
      })
      return { research_key: rk }
    }),

  // Patch editable fields: top-level `score`/`address_display` mirror columns +
  // the same fields inside the report jsonb so the customer view stays in sync.
  updateFields: requireAction('admin.reports.update')
    .input(UpdateReportFieldsInput)
    .mutation(async ({ ctx, input }): Promise<{ token: string }> => {
      const { data: row, error } = await ctx.db
        .from('sc_analyzer_reports')
        .select('report')
        .eq('token', input.token)
        .maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'דוח לא נמצא' })

      const patch: Record<string, unknown> = {}
      const report = rget(row.report) ? { ...(row.report as Record<string, any>) } : null
      if (input.score != null) {
        patch.score = input.score
        if (report) report.score = input.score
      }
      if (input.address_display != null) {
        patch.address_display = input.address_display
        if (report?.address && typeof report.address === 'object') {
          report.address = { ...report.address, formatted: input.address_display }
        }
      }
      if (report) patch.report = report
      if (Object.keys(patch).length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'אין שדות לעדכון' })
      }

      const { error: upErr } = await ctx.db
        .from('sc_analyzer_reports')
        .update(patch)
        .eq('token', input.token)
      if (upErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: upErr.message })

      await audit(ctx.db, {
        actor_id: ctx.user.id,
        action: 'report.update',
        target_type: 'report',
        target_id: input.token,
        meta: { score: input.score, address_display: input.address_display },
        ip: ctx.ip,
      })
      return { token: input.token }
    }),

  // Upsert the internal flag (pin + note) for a report.
  setFlag: requireAction('admin.reports.update')
    .input(SetReportFlagInput)
    .mutation(async ({ ctx, input }): Promise<ReportFlag> => {
      const { data: existing } = await ctx.db
        .from('sc_report_flags')
        .select('report_token,pinned,note')
        .eq('report_token', input.token)
        .maybeSingle()

      const next = {
        report_token: input.token,
        admin_id: ctx.user.id,
        pinned: input.pinned != null ? input.pinned : (existing?.pinned ?? false),
        note: input.note !== undefined ? input.note : ((existing?.note as string | null) ?? null),
        updated_at: new Date().toISOString(),
      }

      const { data, error } = await ctx.db
        .from('sc_report_flags')
        .upsert(next, { onConflict: 'report_token' })
        .select('report_token,admin_id,pinned,note,updated_at')
        .single()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      await audit(ctx.db, {
        actor_id: ctx.user.id,
        action: 'report.set_flag',
        target_type: 'report',
        target_id: input.token,
        meta: { pinned: next.pinned, has_note: !!next.note },
        ip: ctx.ip,
      })

      return {
        report_token: data.report_token as string,
        admin_id: (data.admin_id as string | null) ?? null,
        pinned: !!data.pinned,
        note: (data.note as string | null) ?? null,
        updated_at: (data.updated_at as string | null) ?? null,
      }
    }),
})
