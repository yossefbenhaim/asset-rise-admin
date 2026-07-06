import type { SupabaseClient } from '@supabase/supabase-js'
import {
  SYSTEM_ANNOUNCEMENT_KIND,
  type GodBroadcastAudience,
  type GodBroadcastPreview,
  type GodBroadcastRecipientSample,
  type GodBroadcastBuilding,
  type GodBroadcastSendResult,
  type GodBroadcastRecent,
} from '@asset-rise/shared'

// God-mode "System Broadcast" repo (Wave 3 — content + comms). Runs as
// service-role (adminClient) so it reads sc_profiles / sc_tenant_profiles /
// sc_family_links and writes sc_notifications across ALL users, bypassing RLS.
// Routers gate access; repos only do DB work. All writes are wrapped by
// godMutation() at the router layer.
//
// Domain model (silver-castle sc_*, confirmed against
// db/migrations/013_notifications.sql + 051_notifications_fix.sql +
// 052_notifications_event_index.sql + 001_init_profiles.sql):
//   sc_notifications(id, recipient_id, kind, title, body, link, payload,
//                    read_at, created_at, event_id) — kind has NO db CHECK
//                    since migration 051. One row per recipient; all rows of a
//                    send share one event_id (unique index (event_id,
//                    recipient_id) → idempotent re-run).
//   sc_profiles(id, email, full_name, role ∈ {tenant,provider})
//   sc_tenant_profiles(id → sc_profiles, building_id)
//   sc_family_links(primary_user_id, member_user_id, removed_at) — a linked
//                    family member has its own sc_profiles row but NO
//                    sc_tenant_profiles row, so the building fan-out misses
//                    them unless we expand (mirrors the main app's notify()).
//   sc_buildings(id, city, street, building_number)

// FK-violation SQLSTATE — surfaced (translated to Hebrew) by the router. The
// only FK on an insert is recipient_id → sc_profiles; we resolve recipients
// from sc_profiles so it can't trip, but we keep the guard for defence in depth.
export const PG_FK_VIOLATION = '23503'

// Supabase/PostgREST caps a single insert payload; chunk large fan-outs so a
// system-wide blast doesn't exceed limits or time out.
const INSERT_CHUNK = 500
const SAMPLE_SIZE = 20

function addressOf(
  b:
    | {
        street?: string | null
        building_number?: string | null
        city?: string | null
      }
    | null
    | undefined,
): string | null {
  if (!b) return null
  const line = [b.street, b.building_number].filter(Boolean).join(' ')
  const full = [line, b.city].filter(Boolean).join(', ').trim()
  return full || null
}

// ── Buildings picker ───────────────────────────────────────────────────────────
// Buildings that have at least one tenant, with a tenant count, for the
// "one building" audience selector.
export async function listBroadcastBuildings(db: SupabaseClient): Promise<GodBroadcastBuilding[]> {
  // Count tenants per building first so we only surface buildings with people.
  const { data: tps, error: tpErr } = await db
    .from('sc_tenant_profiles')
    .select('building_id')
    .not('building_id', 'is', null)
    .limit(20000)
  if (tpErr) throw new Error(tpErr.message)

  const counts = new Map<string, number>()
  for (const r of (tps ?? []) as Array<{ building_id: string | null }>) {
    if (!r.building_id) continue
    counts.set(r.building_id, (counts.get(r.building_id) ?? 0) + 1)
  }
  const ids = Array.from(counts.keys())
  if (!ids.length) return []

  const { data: buildings, error: bErr } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .in('id', ids)
  if (bErr) throw new Error(bErr.message)

  return (buildings ?? [])
    .map(b => ({
      id: b.id as string,
      address: addressOf(b as any),
      city: (b as any).city ?? null,
      tenant_count: counts.get(b.id as string) ?? 0,
    }))
    .sort((a, b) => b.tenant_count - a.tenant_count)
}

// ── Family expansion (mirrors silver-castle notification.repo.expandWithFamily) ──
// Expand a set of primary recipient ids to also include their ACTIVE linked
// family members (sc_family_links). Best-effort: on any error, return input
// unchanged (a missing family link must never drop a broadcast recipient).
async function expandWithFamily(db: SupabaseClient, ids: string[]): Promise<string[]> {
  const base = ids.filter(Boolean)
  if (base.length === 0) return base
  try {
    const out = new Set(base)
    // Chunk the IN() so a very large building doesn't blow the query.
    for (let i = 0; i < base.length; i += 1000) {
      const slice = base.slice(i, i + 1000)
      const { data, error } = await db
        .from('sc_family_links')
        .select('primary_user_id, member_user_id')
        .is('removed_at', null)
        .in('primary_user_id', slice)
      if (error || !data) continue
      for (const row of data as Array<{ member_user_id: string | null }>) {
        if (row.member_user_id) out.add(row.member_user_id)
      }
    }
    return Array.from(out)
  } catch {
    return base
  }
}

// ── Audience resolution ─────────────────────────────────────────────────────────
// Resolve an audience to a deduped, family-expanded recipient id list PLUS a
// human label and a small profile sample. Single source of truth used by both
// preview and send so the previewed count matches what actually gets inserted.
interface ResolvedAudience {
  ids: string[]
  label: string
  sample: GodBroadcastRecipientSample[]
}

export async function resolveAudience(
  db: SupabaseClient,
  audience: GodBroadcastAudience,
): Promise<ResolvedAudience> {
  let primaryIds: string[] = []
  let label = ''

  if (audience.type === 'all') {
    primaryIds = await selectProfileIds(db, null)
    label = 'כל המשתמשים'
  } else if (audience.type === 'role') {
    primaryIds = await selectProfileIds(db, audience.role)
    label = audience.role === 'tenant' ? 'כל הדיירים' : 'כל נותני השירות'
  } else {
    // building — tenants of one building (then family-expanded below).
    const { data: tps, error } = await db
      .from('sc_tenant_profiles')
      .select('id')
      .eq('building_id', audience.building_id)
      .limit(20000)
    if (error) throw new Error(error.message)
    primaryIds = (tps ?? []).map(r => r.id as string).filter(Boolean)
    label = `דיירי בניין · ${await buildingLabel(db, audience.building_id)}`
  }

  const expanded = await expandWithFamily(db, Array.from(new Set(primaryIds)))
  const ids = Array.from(new Set(expanded.filter(Boolean)))
  const sample = await profileSample(db, ids.slice(0, SAMPLE_SIZE))
  return { ids, label, sample }
}

// Page through sc_profiles.id (optionally filtered by role). The system-wide
// audience can exceed PostgREST's default 1000-row cap, so we paginate by
// created_at-stable ordering on id until a short page.
async function selectProfileIds(
  db: SupabaseClient,
  role: 'tenant' | 'provider' | null,
): Promise<string[]> {
  const PAGE = 1000
  const out: string[] = []
  let from = 0
  for (;;) {
    let q = db
      .from('sc_profiles')
      .select('id')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (role) q = q.eq('role', role)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<{ id: string }>
    for (const r of rows) if (r.id) out.push(r.id)
    if (rows.length < PAGE) break
    from += PAGE
    // Hard ceiling so a runaway can't loop forever.
    if (from > 100000) break
  }
  return out
}

async function profileSample(
  db: SupabaseClient,
  ids: string[],
): Promise<GodBroadcastRecipientSample[]> {
  if (!ids.length) return []
  const { data } = await db.from('sc_profiles').select('id, full_name, email').in('id', ids)
  return ((data ?? []) as any[]).map(p => ({
    id: p.id,
    name: p.full_name ?? null,
    email: p.email ?? null,
  }))
}

async function buildingLabel(db: SupabaseClient, building_id: string): Promise<string> {
  const { data } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .eq('id', building_id)
    .maybeSingle()
  if (!data) throw new Error('BUILDING_NOT_FOUND')
  return addressOf(data as any) ?? building_id
}

// ── Preview ──────────────────────────────────────────────────────────────────
export async function previewBroadcast(
  db: SupabaseClient,
  audience: GodBroadcastAudience,
): Promise<GodBroadcastPreview> {
  const { ids, label, sample } = await resolveAudience(db, audience)
  return { count: ids.length, audience_label: label, sample }
}

// ── Send (chunked batch insert) ──────────────────────────────────────────────
// Insert one 'system.announcement' row per resolved recipient. All rows share a
// single event_id (passed in by the router so the audit meta can reference it),
// inserted in chunks. Uses upsert with ignoreDuplicates on (event_id,
// recipient_id) so a partial-then-retried send can't double-notify the same
// person. Returns how many rows landed.
export async function sendBroadcast(
  db: SupabaseClient,
  args: {
    event_id: string
    audience: GodBroadcastAudience
    title: string
    body?: string | null
    link?: string | null
    actor_id: string | null
  },
): Promise<GodBroadcastSendResult> {
  const { ids, label } = await resolveAudience(db, args.audience)
  if (!ids.length) {
    throw new Error('NO_RECIPIENTS')
  }

  const payload = {
    source: 'god.broadcast',
    audience: args.audience.type,
    building_id: args.audience.type === 'building' ? args.audience.building_id : null,
    role: args.audience.type === 'role' ? args.audience.role : null,
    sent_by: args.actor_id,
  }

  // `sent` counts rows that ACTUALLY landed (the upsert .select() returns only
  // inserted rows; ignoreDuplicates skips any pre-existing (event_id,recipient_id)
  // pair), so the reported/audited count reflects real deliveries rather than
  // rows merely attempted. `expected` is the resolved-audience size for drift.
  let sent = 0
  for (let i = 0; i < ids.length; i += INSERT_CHUNK) {
    const slice = ids.slice(i, i + INSERT_CHUNK)
    const rows = slice.map(rid => ({
      recipient_id: rid,
      kind: SYSTEM_ANNOUNCEMENT_KIND,
      title: args.title,
      body: args.body ?? null,
      link: args.link ?? null,
      payload,
      event_id: args.event_id,
    }))
    const { data, error } = await db
      .from('sc_notifications')
      .upsert(rows, { onConflict: 'event_id,recipient_id', ignoreDuplicates: true })
      .select('recipient_id')
    if (error) throw error
    sent += data?.length ?? 0
  }

  return { event_id: args.event_id, sent, expected: ids.length, audience_label: label }
}

// ── Recent sends (grouped by event_id) ─────────────────────────────────────────
// List recent 'system.announcement' broadcasts, one summary row per event_id,
// newest first. We pull a window of system.announcement rows and aggregate in
// memory — broadcast volume is low (super-admin only), and grouping by event_id
// keeps each send as one logical entry.
export async function listRecentBroadcasts(
  db: SupabaseClient,
  limit: number,
): Promise<GodBroadcastRecent[]> {
  // Pull enough rows to cover `limit` distinct sends. A single send can be
  // thousands of rows, so cap the scan and aggregate; this is a review surface,
  // not an exact ledger.
  const { data, error } = await db
    .from('sc_notifications')
    .select('event_id, title, body, link, read_at, created_at')
    .eq('kind', SYSTEM_ANNOUNCEMENT_KIND)
    .order('created_at', { ascending: false })
    .limit(20000)
  if (error) throw new Error(error.message)

  type Agg = {
    event_id: string | null
    title: string
    body: string | null
    link: string | null
    recipient_count: number
    read_count: number
    sent_at: string | null
  }
  const byEvent = new Map<string, Agg>()
  const orphans: Agg[] = []

  for (const r of (data ?? []) as any[]) {
    const ev = r.event_id as string | null
    const sentAt = r.created_at as string | null
    if (!ev) {
      // event_id null (legacy / direct-path) — each row is its own logical send.
      orphans.push({
        event_id: null,
        title: r.title ?? '',
        body: r.body ?? null,
        link: r.link ?? null,
        recipient_count: 1,
        read_count: r.read_at ? 1 : 0,
        sent_at: sentAt,
      })
      continue
    }
    const cur =
      byEvent.get(ev) ??
      ({
        event_id: ev,
        title: r.title ?? '',
        body: r.body ?? null,
        link: r.link ?? null,
        recipient_count: 0,
        read_count: 0,
        sent_at: sentAt,
      } as Agg)
    cur.recipient_count += 1
    if (r.read_at) cur.read_count += 1
    // Keep the earliest created_at as the send time.
    if (sentAt && (!cur.sent_at || sentAt < cur.sent_at)) cur.sent_at = sentAt
    byEvent.set(ev, cur)
  }

  const merged = [...byEvent.values(), ...orphans]
  merged.sort((a, b) => (b.sent_at ?? '').localeCompare(a.sent_at ?? ''))
  return merged.slice(0, limit)
}
