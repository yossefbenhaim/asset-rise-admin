// Claude quota snapshot for the always-on top bar. A host cron
// (claude-budget-collect.sh) upserts sc_claude_budget; this just reads it. Any
// authenticated admin may see it.
import { router, protectedProcedure } from '../trpc.js'

// Official usage from `claude -p "/usage"` — percentages USED (not estimates).
export interface ClaudeBudget {
  session_pct: number
  session_reset_at: string | null
  week_all_pct: number
  week_fable_pct: number
  week_reset_at: string | null
  updated_at: string
}

export const budgetRouter = router({
  current: protectedProcedure.query(async ({ ctx }): Promise<ClaudeBudget | null> => {
    const { data } = await ctx.db.from('sc_claude_budget').select('*').eq('id', 1).maybeSingle()
    return (data as ClaudeBudget | null) ?? null
  }),
})
