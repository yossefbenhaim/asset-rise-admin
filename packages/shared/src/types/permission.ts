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

export interface Permission {
  role_key: string
  action: Action
  scope: 'own' | 'building' | 'project' | 'all'
}
