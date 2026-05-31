import type { SupabaseClient } from '@supabase/supabase-js'
import { roleKeysFor, type SessionUser, type RoleKey } from '@asset-rise/shared'

// Resolve a SessionUser from a Supabase auth.users id. We deliberately only
// care about admin_levels here — tenants/providers cannot use this app, so
// their data stays unloaded (saves a query each request).
export async function loadSessionUser(
  db: SupabaseClient,
  userId: string,
): Promise<{ user: SessionUser; roleKeys: RoleKey[] } | null> {
  const { data: profile } = await db
    .from('sc_profiles')
    .select('id, email, full_name, phone, role, provider_type')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return null

  let admin_levels: SessionUser['admin_levels'] = null
  if (profile.role === 'admin') {
    const { data: ap } = await db
      .from('sc_admin_profiles')
      .select('is_admin, is_admin_support, is_admin_sales, is_super_admin')
      .eq('id', userId)
      .maybeSingle()
    if (ap) {
      admin_levels = {
        is_admin: ap.is_admin,
        is_admin_support: ap.is_admin_support,
        is_admin_sales: ap.is_admin_sales,
        is_super_admin: ap.is_super_admin,
      }
    }
  }

  const user: SessionUser = {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    phone: profile.phone,
    role: profile.role,
    provider_type: profile.provider_type,
    tenant_levels: null,
    admin_levels,
    building_id: null,
  }

  const roleKeys = roleKeysFor({
    role: user.role,
    provider_type: user.provider_type,
    admin_levels: user.admin_levels ?? undefined,
  })

  return { user, roleKeys }
}
