import type { SupabaseClient } from '@supabase/supabase-js'
import type { GodSearchHit, AuditRow, GodAuditListInput } from '@asset-rise/shared'

// PostgREST treats comma and parens specially inside .or() filter strings, so
// we strip them from the user term before interpolating it into the value
// position. We ALSO strip LIKE/ilike metacharacters (% _ * and backslash) so a
// term like "%" can't turn the search into a match-everything PII dump. The
// Zod schema already caps length at 120; this only narrows the charset.
function sanitizeTerm(q: string): string {
  return q.replace(/[(),%_*\\]/g, ' ').trim()
}

// ── Global search ──────────────────────────────────────────────────────────
// Runs as service-role across the core sc_* tables and returns PII (emails,
// phones). Gated by god.search (super-admin only). Each table capped at 10.
export async function godSearch(db: SupabaseClient, q: string): Promise<GodSearchHit[]> {
  const safe = sanitizeTerm(q)
  if (!safe) return []
  const term = `%${safe}%`

  const [profiles, buildings, projects, leads] = await Promise.all([
    db
      .from('sc_profiles')
      .select('id, full_name, email, role')
      .or(`full_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
      .limit(10),
    db
      .from('sc_buildings')
      .select('id, city, street, building_number')
      .or(`city.ilike.${term},street.ilike.${term},building_number.ilike.${term}`)
      .limit(10),
    db
      .from('sc_projects')
      .select('id, name, current_stage, building_id')
      .ilike('name', term)
      .limit(10),
    db
      .from('sc_leads')
      .select('id, name, phone, email, status')
      .or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`)
      .limit(10),
  ])

  const hits: GodSearchHit[] = []

  for (const p of (profiles.data ?? []) as any[]) {
    hits.push({
      type: 'user',
      id: p.id,
      label: p.full_name || p.email || p.id,
      sublabel: [p.email, p.role].filter(Boolean).join(' · ') || null,
      to: '/users',
    })
  }
  for (const b of (buildings.data ?? []) as any[]) {
    const addr = [b.street, b.building_number].filter(Boolean).join(' ')
    hits.push({
      type: 'building',
      id: b.id,
      label: [addr, b.city].filter(Boolean).join(', ') || b.id,
      sublabel: b.city || null,
      to: '/buildings',
    })
  }
  for (const pr of (projects.data ?? []) as any[]) {
    hits.push({
      type: 'project',
      id: pr.id,
      label: pr.name || pr.id,
      sublabel: pr.current_stage || null,
      to: '/buildings',
    })
  }
  for (const l of (leads.data ?? []) as any[]) {
    hits.push({
      type: 'lead',
      id: l.id,
      label: l.name || l.id,
      sublabel: [l.phone, l.status].filter(Boolean).join(' · ') || null,
      to: '/leads',
    })
  }

  return hits
}

// ── Audit log viewer ────────────────────────────────────────────────────────
// Read-only listing of sc_audit_log (which is DB-immutable via migration 007).
// Enriches actor_id -> actor email via a single batched sc_profiles lookup.
export async function listAudit(
  db: SupabaseClient,
  filters: GodAuditListInput,
): Promise<AuditRow[]> {
  let q = db
    .from('sc_audit_log')
    .select('id, actor_id, action, target_type, target_id, meta, ip, created_at')
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? 200)

  if (filters.actor_id) q = q.eq('actor_id', filters.actor_id)
  if (filters.action) q = q.ilike('action', `%${filters.action}%`)
  if (filters.target_type) q = q.eq('target_type', filters.target_type)
  if (filters.target_id) q = q.eq('target_id', filters.target_id)
  if (filters.from) q = q.gte('created_at', filters.from)
  if (filters.to) q = q.lte('created_at', filters.to)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]

  // Batch-resolve actor emails.
  const actorIds = Array.from(new Set(rows.map(r => r.actor_id).filter((x): x is string => !!x)))
  const emailById = new Map<string, string | null>()
  if (actorIds.length) {
    const { data: profiles } = await db.from('sc_profiles').select('id, email').in('id', actorIds)
    for (const p of (profiles ?? []) as any[]) emailById.set(p.id, p.email ?? null)
  }

  return rows.map(r => ({
    id: r.id,
    actor_id: r.actor_id ?? null,
    actor_email: r.actor_id ? (emailById.get(r.actor_id) ?? null) : null,
    action: r.action,
    target_type: r.target_type ?? null,
    target_id: r.target_id ?? null,
    meta: (r.meta ?? null) as Record<string, unknown> | null,
    ip: r.ip ?? null,
    created_at: r.created_at,
  }))
}
