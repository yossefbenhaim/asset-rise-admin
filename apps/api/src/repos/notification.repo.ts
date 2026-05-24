import type { SupabaseClient } from '@supabase/supabase-js'
import type { NotificationKind } from '@asset-rise/shared'

// Bulk-insert one row per recipient into sc_notifications. Best-effort —
// failures are logged, never thrown.
export async function notify(args: {
  db: SupabaseClient
  recipient_ids: string[]
  kind: NotificationKind
  title: string
  body?: string | null
  link?: string | null
  payload?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const ids = Array.from(new Set(args.recipient_ids.filter(Boolean)))
    if (ids.length === 0) return
    const rows = ids.map(rid => ({
      recipient_id: rid,
      kind: args.kind,
      title: args.title,
      body: args.body ?? null,
      link: args.link ?? null,
      payload: args.payload ?? null,
    }))
    const { error } = await args.db.from('sc_notifications').insert(rows)
    if (error) console.error('[notify] insert failed', args.kind, error.message)
  } catch (e: any) {
    console.error('[notify] threw', args.kind, e?.message ?? e)
  }
}
