/**
 * Developer parcel checks (בדיקת יזם) — read-only.
 *
 * WHY THIS EXISTS
 * `sc_developer_reports` was reachable from nothing on the admin side: a grep
 * over apps/api/src returned no hit before this file. The developer lane has
 * been running and writing rows since 2026-07-10, and none of it was visible in
 * admin.byclick.co.il or in Agent OS. The tenant lane (sc_analyzer_reports) had
 * a router from the start; this half simply never got one.
 *
 * Read-only on purpose. The worker owns this table — it claims rows, advances
 * `stage`, counts `attempts` and has a stale-reaper. An admin write racing that
 * loop would be a genuine correctness problem, and nothing on the screen needs
 * one. Re-running a check is the worker's job, not a button's.
 *
 * The list keeps its own summary projection rather than shipping `result`,
 * which is a ~50 KB jsonb per row: pulling 200 of those to render a table is
 * tens of megabytes for six visible columns.
 */
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { router, requireAction } from '../trpc.js'

/** Defensive jsonb reach — older rows predate fields, failed rows have no result. */
function j(v: unknown): Record<string, any> | null {
  return v && typeof v === 'object' ? (v as Record<string, any>) : null
}

interface DbRow {
  token: string
  status: string
  stage: string | null
  input: unknown
  result: unknown
  error: string | null
  attempts: number
  created_at: string
  completed_at: string | null
}

/**
 * One row of the list. Everything here is derived from jsonb, so every reach is
 * null-tolerant: a `failed` row has no result at all, and rows written by older
 * engine versions are missing fields the current one always writes.
 */
function summarize(r: DbRow) {
  const input = j(r.input)
  const result = j(r.result)
  const verdict = j(result?.verdict)
  const findings = j(result?.redflags)?.findings

  return {
    token: r.token,
    status: r.status,
    stage: r.stage,
    city: typeof input?.city === 'string' ? input.city : null,
    address: typeof input?.address === 'string' ? input.address : null,
    gush: typeof input?.gush === 'number' ? input.gush : null,
    chelka: typeof input?.chelka === 'number' ? input.chelka : null,
    // 0-5. The ladder the canary asserts on; 5 = "almost certainly taken".
    activity_score: typeof verdict?.activity_score === 'number' ? verdict.activity_score : null,
    verdict_label: typeof verdict?.label === 'string' ? verdict.label : null,
    redflag_count: Array.isArray(findings) ? findings.length : null,
    coverage_grade: typeof result?.coverage_grade === 'string' ? result.coverage_grade : null,
    engine_version: typeof result?.engine_version === 'string' ? result.engine_version : null,
    error: r.error,
    attempts: r.attempts,
    created_at: r.created_at,
    completed_at: r.completed_at,
  }
}

const SELECT = 'token,status,stage,input,result,error,attempts,created_at,completed_at'

export const developerReportsRouter = router({
  list: requireAction('admin.reports.list')
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(500).optional(),
          status: z.enum(['pending', 'running', 'done', 'failed']).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      let q = ctx.db
        .from('sc_developer_reports')
        .select(SELECT)
        .order('created_at', { ascending: false })
        .limit(input?.limit ?? 100)
      if (input?.status) q = q.eq('status', input.status)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as unknown as DbRow[]).map(summarize)
    }),

  /** Full row including the raw result jsonb — for the detail drawer only. */
  get: requireAction('admin.reports.list')
    .input(z.object({ token: z.string().min(1).max(120) }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from('sc_developer_reports')
        .select(SELECT)
        .eq('token', input.token)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new TRPCError({ code: 'NOT_FOUND', message: 'בדיקה לא נמצאה' })
      const row = data as unknown as DbRow
      return { ...summarize(row), result: row.result ?? null, input: row.input ?? null }
    }),
})
