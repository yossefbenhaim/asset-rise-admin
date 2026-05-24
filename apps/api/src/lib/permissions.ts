import type { SupabaseClient } from '@supabase/supabase-js'
import type { Action, RoleKey } from '@asset-rise/shared'

// Resolve "can this user perform this action?" by joining their role-keys
// against sc_permissions. Cached briefly per-process to avoid hot loops.
const CACHE_TTL_MS = 30_000
const cache = new Map<string, { at: number; allowed: Set<string> }>()

async function loadAllowed(db: SupabaseClient, roleKey: string): Promise<Set<string>> {
  const cached = cache.get(roleKey)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.allowed
  const { data } = await db
    .from('sc_permissions')
    .select('action')
    .eq('role_key', roleKey)
  const allowed = new Set((data ?? []).map((r: any) => r.action as string))
  cache.set(roleKey, { at: Date.now(), allowed })
  return allowed
}

export async function can(db: SupabaseClient, roleKeys: RoleKey[], action: Action): Promise<boolean> {
  for (const rk of roleKeys) {
    const allowed = await loadAllowed(db, rk)
    if (allowed.has(action)) return true
  }
  return false
}
