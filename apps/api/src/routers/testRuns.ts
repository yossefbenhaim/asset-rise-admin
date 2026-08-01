// Weekly test-ecosystem history for the Control Center.
//
// Reads sc_test_runs, which ~/ar-ci-record.sh writes one row per (run, tier)
// after each tier of ~/ar-weekly-ci.sh finishes. Pure read; a monitor must not
// pollute what it renders, so there is no audit write here.
//
// The `rc` column carries the ui-proof-run.sh exit contract verbatim, and the
// UI leans on the distinction: 1 is a product failure, 2 is the harness failing
// to start. Collapsing them into "red" is how a suite loses its credibility —
// a week of infrastructure noise reads identically to a week of real bugs.
import { z } from 'zod'
import { router, requireAction } from '../trpc.js'

const SELECT =
  'id,run_id,tier,rc,verdict,specs_passed,specs_failed,duration_s,branch,sha,report_url,details,created_at'

export interface TestRunRow {
  id: string
  run_id: string
  tier: string
  rc: number
  verdict: string
  specs_passed: number
  specs_failed: number
  duration_s: number
  branch: string | null
  sha: string | null
  report_url: string | null
  details: Record<string, unknown>
  created_at: string
}

export const testRunsRouter = router({
  list: requireAction('admin.sources.view')
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(500).optional(),
          tier: z.string().max(40).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      let q = ctx.db
        .from('sc_test_runs')
        .select(SELECT)
        .order('created_at', { ascending: false })
        .limit(input?.limit ?? 120)
      if (input?.tier) q = q.eq('tier', input.tier)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as TestRunRow[]
    }),

  /**
   * Latest row per tier — the "is it green right now" answer.
   *
   * Derived from one ordered read rather than a query per tier: the table is
   * small, and N round trips to render a header is the kind of thing that ages
   * badly once there are more tiers.
   */
  latest: requireAction('admin.sources.view').query(async ({ ctx }) => {
    const { data, error } = await ctx.db
      .from('sc_test_runs')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    const seen = new Map<string, TestRunRow>()
    for (const row of (data ?? []) as unknown as TestRunRow[]) {
      if (!seen.has(row.tier)) seen.set(row.tier, row)
    }
    return [...seen.values()]
  }),
})
