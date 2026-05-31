// Roles, role-keys, and the function that flattens (role + levels) → RoleKey[].
// Admin is the only role this app actually serves — the others exist only
// because we read them from the shared sc_profiles table.

export type Role = 'tenant' | 'provider' | 'admin'

export type ProviderType =
  | 'architect'
  | 'appraiser'
  | 'lawyer'
  | 'developer'
  | 'contractor'
  | 'coordinator'
  | 'generic'

export interface TenantLevels {
  is_organizer: boolean
  is_committee_member: boolean
  is_committee_chair: boolean
}

export interface AdminLevels {
  is_admin: boolean
  is_admin_support: boolean
  is_admin_sales: boolean
  is_super_admin: boolean
}

export type RoleKey =
  | 'tenant'
  | 'tenant.organizer'
  | 'tenant.committee'
  | 'tenant.chair'
  | 'provider.architect'
  | 'provider.appraiser'
  | 'provider.lawyer'
  | 'provider.developer'
  | 'provider.contractor'
  | 'provider.coordinator'
  | 'provider.generic'
  | 'admin'
  | 'admin.super'
  | 'admin.support'
  | 'admin.sales'

export function roleKeysFor(input: {
  role: Role
  provider_type: ProviderType | null
  tenant_levels?: TenantLevels
  admin_levels?: AdminLevels
}): RoleKey[] {
  const keys: RoleKey[] = []
  if (input.role === 'tenant') {
    keys.push('tenant')
    const lvl = input.tenant_levels
    if (lvl?.is_organizer) keys.push('tenant.organizer')
    if (lvl?.is_committee_chair || lvl?.is_committee_member) keys.push('tenant.committee')
    if (lvl?.is_committee_chair) keys.push('tenant.chair')
  } else if (input.role === 'provider' && input.provider_type) {
    keys.push(`provider.${input.provider_type}` as RoleKey)
  } else if (input.role === 'admin') {
    keys.push('admin')
    const lvl = input.admin_levels
    // Super-admin is additive — it sits on top of 'admin', never replaces it.
    if (lvl?.is_super_admin) keys.push('admin.super')
    if (lvl?.is_admin_support) keys.push('admin.support')
    if (lvl?.is_admin_sales) keys.push('admin.sales')
  }
  return keys
}
