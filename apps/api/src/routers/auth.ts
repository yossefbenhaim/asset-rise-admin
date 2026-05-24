import { router, publicProcedure } from '../trpc.js'

// Whoami — used by SessionProvider on the frontend. Mirrors Silver Castle's
// auth.me shape so the frontend integration is familiar.
export const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.supabase) return { state: 'anonymous' as const }
    if (!ctx.user) {
      return {
        state: 'needs_registration' as const,
        supabase: ctx.supabase,
      }
    }
    return {
      state: 'authenticated' as const,
      user: ctx.user,
      role_keys: ctx.roleKeys,
    }
  }),
})
