import type { CreateExpressContextOptions } from '@trpc/server/adapters/express'
import { adminClient } from './db/supabase.js'
import { loadSessionUser } from './lib/session-user.js'
import type { SessionUser, RoleKey } from '@asset-rise/shared'

export interface SupabaseIdentity {
  id: string
  email: string | null
  full_name: string | null
}

export interface Context {
  db: ReturnType<typeof adminClient>
  user: SessionUser | null
  roleKeys: RoleKey[]
  supabase: SupabaseIdentity | null
  ip: string | null
}

export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  const db = adminClient()
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    null

  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return { db, user: null, roleKeys: [], supabase: null, ip }
  }
  const jwt = auth.slice('Bearer '.length)

  const { data: authResp, error } = await db.auth.getUser(jwt)
  if (error || !authResp?.user) {
    return { db, user: null, roleKeys: [], supabase: null, ip }
  }

  const supabase: SupabaseIdentity = {
    id: authResp.user.id,
    email: authResp.user.email ?? null,
    full_name:
      (authResp.user.user_metadata?.full_name as string | undefined) ??
      (authResp.user.user_metadata?.name as string | undefined) ??
      null,
  }

  const sess = await loadSessionUser(db, authResp.user.id)
  if (!sess) return { db, user: null, roleKeys: [], supabase, ip }

  return { db, user: sess.user, roleKeys: sess.roleKeys, supabase, ip }
}

export type AppContext = Context
