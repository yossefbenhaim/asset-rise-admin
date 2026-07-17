// Claude quota snapshot for the always-on top bar. A host cron
// (claude-budget-collect.sh) upserts sc_claude_budget; this just reads it. Any
// authenticated admin may see it.
import { router, protectedProcedure } from '../trpc.js'

export interface ClaudeBudget {
  session_used_tokens: number
  session_reset_at: string | null
  session_cap_m: number
  week_opus_tokens: number
  week_sonnet_tokens: number
  week_haiku_tokens: number
  week_opus_cap_m: number
  week_sonnet_cap_m: number
  week_haiku_cap_m: number
  updated_at: string
}

export const budgetRouter = router({
  current: protectedProcedure.query(async ({ ctx }): Promise<ClaudeBudget | null> => {
    const { data } = await ctx.db.from('sc_claude_budget').select('*').eq('id', 1).maybeSingle()
    return (data as ClaudeBudget | null) ?? null
  }),
})
