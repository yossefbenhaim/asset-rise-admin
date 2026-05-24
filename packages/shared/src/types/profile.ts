import type { Role, ProviderType, TenantLevels, AdminLevels } from './role'

// SessionUser — compact view of the authenticated user returned by auth.me.
// We carry tenant_levels purely for completeness (it's almost always null in
// this app since only admins log in); admin_levels is what we actually act on.
export interface SessionUser {
  id: string
  email: string
  full_name: string
  phone: string | null
  role: Role
  provider_type: ProviderType | null
  tenant_levels: TenantLevels | null
  admin_levels: AdminLevels | null
  building_id: string | null
}
