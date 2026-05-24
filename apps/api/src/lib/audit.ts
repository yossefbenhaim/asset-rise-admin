import type { SupabaseClient } from '@supabase/supabase-js'

// Write a row to sc_audit_log. Audit failure never breaks the calling
// mutation — just logs and moves on.
export async function audit(
  db: SupabaseClient,
  args: {
    actor_id: string | null
    action: string
    target_type?: string | null
    target_id?: string | null
    meta?: Record<string, unknown> | null
    ip?: string | null
  },
): Promise<void> {
  const { error } = await db.from('sc_audit_log').insert({
    actor_id: args.actor_id,
    action: args.action,
    target_type: args.target_type ?? null,
    target_id: args.target_id ?? null,
    meta: args.meta ?? null,
    ip: args.ip ?? null,
  })
  if (error) console.error('[audit]', args.action, error.message)
}
