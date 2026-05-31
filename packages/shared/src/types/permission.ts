// Actions enforced by sc_can(user, action). Admin-only set; this app doesn't
// emit any tenant/provider permissions.
export type Action =
  | 'admin.dashboard'
  | 'admin.users.list'
  | 'admin.users.update'
  | 'admin.users.disable'
  | 'admin.users.delete'
  | 'admin.leads.list'
  | 'admin.leads.update'
  | 'admin.buildings.list'
  | 'admin.submissions.list'
  // god.* — super-admin (role_key 'admin.super') capabilities. Future waves
  // add more god actions here; they must stay in lockstep with migration 006's
  // seed and the frontend can() mirror.
  | 'god.search'
  | 'god.audit.list'
  // god-mode Wave 1 — core entities. Seeded by migrations 009/010/011.
  | 'god.buildings.list'
  | 'god.buildings.update'
  | 'god.buildings.force_stage'
  | 'god.buildings.reassign_role'
  | 'god.buildings.delete'
  | 'god.tenants.list'
  | 'god.tenants.update'
  | 'god.tenants.set_vaad'
  | 'god.tenants.move_building'
  | 'god.tenants.set_banned'
  | 'god.tenants.delete'
  | 'god.providers.update'
  | 'god.providers.set_banned'

export interface Permission {
  role_key: string
  action: Action
  scope: 'own' | 'building' | 'project' | 'all'
}
