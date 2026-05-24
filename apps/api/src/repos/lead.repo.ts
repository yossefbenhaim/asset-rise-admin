import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lead, CreateLeadInput, ListLeadsInput, UpdateLeadInput } from '@asset-rise/shared'

const COLS =
  'id, name, phone, email, city, building_address, message, source, status, ' +
  'assigned_to, notes, utm_source, utm_campaign, ip, ' +
  'created_at, updated_at, contacted_at, converted_at'

export async function insertLead(
  db: SupabaseClient,
  input: CreateLeadInput,
  ip: string | null,
): Promise<Lead> {
  const { data, error } = await db.from('sc_leads').insert({
    name: input.name,
    phone: input.phone,
    email: input.email || null,
    city: input.city || null,
    building_address: input.building_address || null,
    message: input.message || null,
    source: input.source || 'landing',
    status: 'new',
    utm_source: input.utm_source || null,
    utm_campaign: input.utm_campaign || null,
    ip,
  }).select(COLS).single()
  if (error) throw new Error(error.message)
  return data as unknown as Lead
}

export async function listLeads(
  db: SupabaseClient,
  filters: ListLeadsInput,
): Promise<Lead[]> {
  const limit = filters?.limit ?? 200
  let q = db.from('sc_leads').select(COLS).limit(limit)
  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.assigned_to !== undefined) {
    if (filters.assigned_to === null) q = q.is('assigned_to', null)
    else q = q.eq('assigned_to', filters.assigned_to)
  }
  if (filters?.q) {
    const term = `%${filters.q}%`
    q = q.or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`)
  }
  const { data, error } = await q.order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Lead[]
}

export async function updateLead(
  db: SupabaseClient,
  input: UpdateLeadInput,
): Promise<Lead> {
  const patch: Record<string, unknown> = {}
  if (input.status !== undefined) {
    patch.status = input.status
    if (input.status === 'contacted') patch.contacted_at = new Date().toISOString()
    if (input.status === 'converted') patch.converted_at = new Date().toISOString()
  }
  if (input.assigned_to !== undefined) patch.assigned_to = input.assigned_to
  if (input.notes !== undefined) patch.notes = input.notes

  const { data, error } = await db
    .from('sc_leads')
    .update(patch)
    .eq('id', input.id)
    .select(COLS)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as Lead
}

// All admin users — get notified when a lead arrives.
export async function adminRecipientIds(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from('sc_admin_profiles').select('id')
  return (data ?? []).map((r: any) => r.id as string)
}
