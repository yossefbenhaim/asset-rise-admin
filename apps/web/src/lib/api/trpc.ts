import { createTRPCReact, httpBatchLink } from '@trpc/react-query'
import type { AppRouter } from '@/types/app-router'
import { supabase } from '@/lib/supabase'

export const trpc = createTRPCReact<AppRouter>()

const TRPC_URL = import.meta.env.VITE_TRPC_URL || '/api/trpc'

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: TRPC_URL,
      async headers() {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        return token ? { authorization: `Bearer ${token}` } : {}
      },
    }),
  ],
})
