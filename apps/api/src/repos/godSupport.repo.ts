import type { SupabaseClient } from '@supabase/supabase-js'
import type { GodSupportThread, GodSupportMessage, GodSupportThreadListItem } from '@asset-rise/shared'

function addressOf(b: { street?: string | null; building_number?: string | null; city?: string | null } | null | undefined): string | null {
  if (!b) return null
  const line = [b.street, b.building_number].filter(Boolean).join(' ')
  return [line, b.city].filter(Boolean).join(', ').trim() || null
}

// Admin support inbox — every thread, newest activity first, with the last
// message preview + who sent it (awaiting_reply = the user spoke last).
export async function listThreads(db: SupabaseClient): Promise<GodSupportThreadListItem[]> {
  const { data: threads } = await db
    .from('sc_support_threads')
    .select('id, user_id, building_id, last_message_at')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(300)
  const tRows = (threads ?? []) as any[]
  if (!tRows.length) return []

  const threadIds = tRows.map(t => t.id)
  const userIds = Array.from(new Set(tRows.map(t => t.user_id).filter(Boolean)))
  const buildingIds = Array.from(new Set(tRows.map(t => t.building_id).filter(Boolean)))

  const [{ data: msgs }, { data: profs }, { data: builds }] = await Promise.all([
    db.from('sc_support_messages').select('thread_id, sender_kind, body, created_at').in('thread_id', threadIds).order('created_at', { ascending: true }),
    userIds.length ? db.from('sc_profiles').select('id, full_name, email, role').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
    buildingIds.length ? db.from('sc_buildings').select('id, city, street, building_number').in('id', buildingIds) : Promise.resolve({ data: [] as any[] }),
  ])

  const lastByThread = new Map<string, { sender_kind: string; body: string }>()
  const countByThread = new Map<string, number>()
  for (const m of (msgs ?? []) as any[]) {
    lastByThread.set(m.thread_id, { sender_kind: m.sender_kind, body: m.body })  // asc → last wins
    countByThread.set(m.thread_id, (countByThread.get(m.thread_id) ?? 0) + 1)
  }
  const profById = new Map<string, any>(); for (const p of (profs ?? []) as any[]) profById.set(p.id, p)
  const bById = new Map<string, any>(); for (const b of (builds ?? []) as any[]) bById.set(b.id, b)

  return tRows.map((t): GodSupportThreadListItem => {
    const last = lastByThread.get(t.id) ?? null
    const p = profById.get(t.user_id)
    const preview = last ? (last.body.length > 80 ? last.body.slice(0, 80) + '…' : last.body) : null
    return {
      thread_id: t.id,
      user_id: t.user_id,
      user_name: p?.full_name ?? null,
      user_email: p?.email ?? null,
      user_role: p?.role ?? null,
      building_address: addressOf(t.building_id ? bById.get(t.building_id) : null),
      last_message_at: t.last_message_at ?? null,
      last_message_preview: preview,
      last_sender_kind: (last?.sender_kind as 'admin' | 'user' | undefined) ?? null,
      awaiting_reply: last?.sender_kind === 'user',
      message_count: countByThread.get(t.id) ?? 0,
    }
  })
}

// god.support repo (service-role). The admin↔user system chat: get/create a
// user's thread, load it, and post an admin message (+ ping the user via
// sc_notifications so they see it in the customer app).

async function resolveContext(db: SupabaseClient, userId: string, role: string | null): Promise<{ building_id: string | null; project_id: string | null }> {
  if (role === 'provider') {
    const { data } = await db.from('sc_project_providers').select('project_id').eq('provider_id', userId).order('added_at', { ascending: false }).limit(1)
    const projectId = (data?.[0]?.project_id as string | undefined) ?? null
    let buildingId: string | null = null
    if (projectId) {
      const { data: p } = await db.from('sc_projects').select('building_id').eq('id', projectId).maybeSingle()
      buildingId = (p?.building_id as string | undefined) ?? null
    }
    return { building_id: buildingId, project_id: projectId }
  }
  const { data: tp } = await db.from('sc_tenant_profiles').select('building_id').eq('id', userId).maybeSingle()
  const buildingId = (tp?.building_id as string | undefined) ?? null
  let projectId: string | null = null
  if (buildingId) {
    const { data: p } = await db.from('sc_projects').select('id').eq('building_id', buildingId).order('created_at', { ascending: false }).limit(1)
    projectId = (p?.[0]?.id as string | undefined) ?? null
  }
  return { building_id: buildingId, project_id: projectId }
}

async function ensureThread(db: SupabaseClient, userId: string): Promise<string> {
  const { data: existing } = await db.from('sc_support_threads').select('id').eq('user_id', userId).maybeSingle()
  if (existing?.id) return existing.id as string
  const { data: prof } = await db.from('sc_profiles').select('role').eq('id', userId).maybeSingle()
  const cxt = await resolveContext(db, userId, (prof?.role as string | undefined) ?? null)
  const { data: created, error } = await db
    .from('sc_support_threads')
    .insert({ user_id: userId, building_id: cxt.building_id, project_id: cxt.project_id })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return created.id as string
}

async function loadMessages(db: SupabaseClient, threadId: string): Promise<GodSupportMessage[]> {
  const { data } = await db
    .from('sc_support_messages')
    .select('id, sender_kind, sender_id, body, created_at, read_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
  const rows = (data ?? []) as any[]
  const ids = Array.from(new Set(rows.map(r => r.sender_id).filter(Boolean)))
  const nameById = new Map<string, string | null>()
  if (ids.length) {
    const { data: profs } = await db.from('sc_profiles').select('id, full_name').in('id', ids)
    for (const p of (profs ?? []) as any[]) nameById.set(p.id, p.full_name ?? null)
  }
  return rows.map(r => ({
    id: r.id,
    sender_kind: r.sender_kind,
    sender_id: r.sender_id ?? null,
    sender_name: r.sender_id ? (nameById.get(r.sender_id) ?? null) : null,
    body: r.body,
    created_at: r.created_at,
    read_at: r.read_at ?? null,
  }))
}

export async function getThread(db: SupabaseClient, userId: string): Promise<GodSupportThread> {
  const { data: prof } = await db.from('sc_profiles').select('id, full_name, email, role').eq('id', userId).maybeSingle()
  const threadId = await ensureThread(db, userId)
  const messages = await loadMessages(db, threadId)
  return {
    thread_id: threadId,
    user: {
      id: userId,
      full_name: (prof?.full_name as string | undefined) ?? null,
      email: (prof?.email as string | undefined) ?? null,
      role: (prof?.role as string | undefined) ?? null,
    },
    messages,
  }
}

export async function sendAdminMessage(db: SupabaseClient, adminId: string, userId: string, body: string): Promise<{ thread_id: string }> {
  const threadId = await ensureThread(db, userId)
  const now = new Date().toISOString()
  const { error: mErr } = await db.from('sc_support_messages').insert({
    thread_id: threadId, sender_kind: 'admin', sender_id: adminId, body,
  })
  if (mErr) throw new Error(mErr.message)
  await db.from('sc_support_threads').update({ last_message_at: now, last_admin_at: now }).eq('id', threadId)

  // Ping the user so they see it in the customer app (bell + realtime). Unknown
  // kind renders fine (Bell fallback); link drives them to the support page.
  const preview = body.length > 90 ? body.slice(0, 90) + '…' : body
  await db.from('sc_notifications').insert({
    recipient_id: userId,
    kind: 'system.direct',
    title: 'הודעה מצוות Asset Rise',
    body: preview,
    link: '/support',
    payload: { source: 'god.support', sent_by: adminId },
  })
  return { thread_id: threadId }
}
