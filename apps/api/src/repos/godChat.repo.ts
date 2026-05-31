import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GodChatBuilding,
  GodChatThread,
  GodChatMessage,
  GodChatThreadInput,
} from '@asset-rise/shared/schemas/godChat'

// God-mode "Chat Moderation" repo (Wave 3 — content + comms). Runs as
// service-role (adminClient) so it reads/writes any sc_* row, bypassing RLS.
// Routers gate access; repos only do DB work. All writes are wrapped by
// godMutation() at the router layer.
//
// Domain model (silver-castle sc_*, confirmed against
// db/migrations/003_building_group_chat.sql + 046_chat_message_actions.sql):
//   sc_chat_threads(id, building_id [UNIQUE], kind, created_at) — one per building
//   sc_chat_messages(id, thread_id, sender_id [nullable], body, meta, created_at,
//                    reply_to_id, edited_at, deleted_at, acted_by_user_id)
// Messages have NO building_id; the building is reached via
// thread_id → sc_chat_threads.building_id. Moderation is purely a flip of
// `deleted_at` (set = soft-deleted, null = visible). We NEVER hard-delete.

// FK-violation SQLSTATE — surfaced (translated to Hebrew) by the router if a
// write ever trips it (defensive; the deleted_at flip itself can't FK-fault).
export const PG_FK_VIOLATION = '23503'

function addressOf(b: {
  street?: string | null
  building_number?: string | null
  city?: string | null
} | null | undefined): string | null {
  if (!b) return null
  const line = [b.street, b.building_number].filter(Boolean).join(' ')
  const full = [line, b.city].filter(Boolean).join(', ').trim()
  return full || null
}

// ── Building picker ────────────────────────────────────────────────────────────
// Every building that has a chat thread, with its message count + soft-deleted
// count, newest thread first. Used to pick a room to moderate.
export async function listChatBuildings(db: SupabaseClient): Promise<GodChatBuilding[]> {
  const { data: threads, error } = await db
    .from('sc_chat_threads')
    .select('id, building_id, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) throw new Error(error.message)
  const threadRows = (threads ?? []) as any[]
  if (!threadRows.length) return []

  const threadIds = threadRows.map(t => t.id as string)
  const buildingIds = Array.from(
    new Set(threadRows.map(t => t.building_id).filter(Boolean) as string[]),
  )

  const [buildingById, counts] = await Promise.all([
    resolveBuildings(db, buildingIds),
    countByThread(db, threadIds),
  ])

  return threadRows.map(t => {
    const c = counts.get(t.id as string) ?? { total: 0, deleted: 0 }
    const b = t.building_id ? buildingById.get(t.building_id) : null
    return {
      building_id: t.building_id ?? null,
      thread_id: t.id,
      address: addressOf(b),
      city: b?.city ?? null,
      message_count: c.total,
      deleted_count: c.deleted,
    } as GodChatBuilding
  })
}

// ── Thread ───────────────────────────────────────────────────────────────────
// The full message thread for one building (INCLUDING soft-deleted rows, flagged
// is_deleted=true), oldest→newest, with sender + acted-by names resolved.
export async function getChatThread(
  db: SupabaseClient,
  input: GodChatThreadInput,
): Promise<GodChatThread> {
  const { data: thread, error } = await db
    .from('sc_chat_threads')
    .select('id, building_id, created_at')
    .eq('building_id', input.building_id)
    .maybeSingle()
  if (error) throw new Error(error.message)

  const buildingById = await resolveBuildings(db, [input.building_id])
  const b = buildingById.get(input.building_id) ?? null
  const base = {
    building_id: input.building_id,
    thread_id: (thread?.id as string) ?? null,
    address: addressOf(b),
    city: b?.city ?? null,
  }

  // No thread for this building yet → empty (a building only gets a thread once
  // a 2nd tenant joins, per silver-castle migration 003).
  if (!thread) {
    return { ...base, message_count: 0, deleted_count: 0, messages: [] }
  }

  const { data: msgRows, error: msgErr } = await db
    .from('sc_chat_messages')
    .select(
      'id, sender_id, body, created_at, edited_at, deleted_at, reply_to_id, acted_by_user_id',
    )
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: true })
    .limit(input.limit ?? 1000)
  if (msgErr) throw new Error(msgErr.message)
  const rows = (msgRows ?? []) as any[]

  // Resolve sender + acted-by names in one batched pass.
  const profileIds = new Set<string>()
  for (const m of rows) {
    if (m.sender_id) profileIds.add(m.sender_id)
    if (m.acted_by_user_id) profileIds.add(m.acted_by_user_id)
  }
  const profileById = await resolveProfiles(db, Array.from(profileIds))

  const messages: GodChatMessage[] = rows.map(m => {
    const sender = m.sender_id ? profileById.get(m.sender_id) : null
    const actedBy = m.acted_by_user_id ? profileById.get(m.acted_by_user_id) : null
    return {
      id: m.id,
      sender_id: m.sender_id ?? null,
      sender_name: sender?.full_name ?? null,
      sender_email: sender?.email ?? null,
      acted_by_name: actedBy?.full_name ?? null,
      body: m.body ?? null,
      created_at: m.created_at ?? null,
      edited_at: m.edited_at ?? null,
      deleted_at: m.deleted_at ?? null,
      is_deleted: !!m.deleted_at,
      reply_to_id: m.reply_to_id ?? null,
    }
  })

  const deletedCount = messages.reduce((n, m) => n + (m.is_deleted ? 1 : 0), 0)
  return {
    ...base,
    message_count: messages.length,
    deleted_count: deletedCount,
    messages,
  }
}

// ── Writes (soft only — deleted_at flip) ─────────────────────────────────────
// softDeleteMessage — set deleted_at = now() (idempotent: only flips a row that
// isn't already deleted, so a repeat call returns null → router surfaces a
// friendly state). Returns the row, the resolved building_id (for the audit
// meta), or 'NOT_FOUND' if the message doesn't exist.
export async function softDeleteMessage(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; deleted_at: string | null; building_id: string | null }> {
  const existing = await loadMessageTarget(db, id)
  if (existing.deleted_at) {
    // Already soft-deleted — treat as a benign no-op so the audit still records
    // the attempt but the caller gets the current state.
    return { id, deleted_at: existing.deleted_at, building_id: existing.building_id }
  }
  const { data, error } = await db
    .from('sc_chat_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, deleted_at')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return { id: data.id, deleted_at: data.deleted_at ?? null, building_id: existing.building_id }
}

// restoreMessage — set deleted_at = null (un-soft-delete). Idempotent: restoring
// an already-visible message is a benign no-op.
export async function restoreMessage(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; deleted_at: string | null; building_id: string | null }> {
  const existing = await loadMessageTarget(db, id)
  if (!existing.deleted_at) {
    return { id, deleted_at: null, building_id: existing.building_id }
  }
  const { data, error } = await db
    .from('sc_chat_messages')
    .update({ deleted_at: null })
    .eq('id', id)
    .select('id, deleted_at')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('NOT_FOUND')
  return { id: data.id, deleted_at: data.deleted_at ?? null, building_id: existing.building_id }
}

// Load a message's deleted-state + resolved building_id (via the thread). Throws
// 'NOT_FOUND' if the message doesn't exist.
export async function loadMessageTarget(
  db: SupabaseClient,
  id: string,
): Promise<{ id: string; thread_id: string | null; deleted_at: string | null; building_id: string | null }> {
  const { data, error } = await db
    .from('sc_chat_messages')
    .select('id, thread_id, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('NOT_FOUND')

  let building_id: string | null = null
  if (data.thread_id) {
    const { data: thread } = await db
      .from('sc_chat_threads')
      .select('building_id')
      .eq('id', data.thread_id)
      .maybeSingle()
    building_id = (thread?.building_id as string) ?? null
  }
  return {
    id: data.id,
    thread_id: data.thread_id ?? null,
    deleted_at: data.deleted_at ?? null,
    building_id,
  }
}

// ── Batch resolvers ───────────────────────────────────────────────────────────
async function resolveBuildings(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { city: string | null; street: string | null; building_number: string | null }>> {
  const map = new Map<string, any>()
  if (!ids.length) return map
  const { data } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .in('id', ids)
  for (const b of (data ?? []) as any[]) map.set(b.id, b)
  return map
}

async function resolveProfiles(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { full_name: string | null; email: string | null }>> {
  const map = new Map<string, any>()
  if (!ids.length) return map
  const { data } = await db.from('sc_profiles').select('id, full_name, email').in('id', ids)
  for (const p of (data ?? []) as any[]) map.set(p.id, p)
  return map
}

// Per-thread total + soft-deleted message counts.
async function countByThread(
  db: SupabaseClient,
  threadIds: string[],
): Promise<Map<string, { total: number; deleted: number }>> {
  const map = new Map<string, { total: number; deleted: number }>()
  if (!threadIds.length) return map
  const { data } = await db
    .from('sc_chat_messages')
    .select('thread_id, deleted_at')
    .in('thread_id', threadIds)
  for (const m of (data ?? []) as any[]) {
    const k = m.thread_id as string
    if (!k) continue
    const cur = map.get(k) ?? { total: 0, deleted: 0 }
    cur.total += 1
    if (m.deleted_at) cur.deleted += 1
    map.set(k, cur)
  }
  return map
}
