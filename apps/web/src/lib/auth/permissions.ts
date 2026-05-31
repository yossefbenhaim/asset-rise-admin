// Frontend mirror of admin permissions. Twin of migration 003_admin_permissions.sql.
// Backend enforces — this only hides UI elements.
import type { Action, RoleKey } from '@asset-rise/shared'

const map: Record<string, Action[]> = {
  admin: [
    'admin.dashboard',
    'admin.users.list', 'admin.users.update', 'admin.users.disable', 'admin.users.delete',
    'admin.leads.list', 'admin.leads.update',
    'admin.buildings.list',
    'admin.submissions.list',
  ],
  // Super-admin god capabilities. MUST mirror migration 006's seed exactly.
  // Only 'admin.super' gets god.* — plain 'admin' deliberately does not.
  'admin.super': [
    'god.search',
    'god.audit.list',
    // Wave 1 — core entities (mirror of migrations 009/010/011).
    'god.buildings.list',
    'god.buildings.update',
    'god.buildings.force_stage',
    'god.buildings.reassign_role',
    'god.buildings.delete',
    'god.tenants.list',
    'god.tenants.update',
    'god.tenants.set_vaad',
    'god.tenants.move_building',
    'god.tenants.set_banned',
    'god.tenants.delete',
    'god.providers.update',
    'god.providers.set_banned',
    // Wave 2 — workflow + deals (mirror of migration 012_god_wave2_perms).
    'god.negotiations.force_stage',
    'god.negotiations.force_status',
    'god.negotiations.link_provider',
    'god.negotiations.unlink_provider',
    'god.tenders.set_status',
    'god.tenders.force_award',
    'god.tenders.cancel',
    'god.polls.create',
    'god.polls.force_finalize',
    'god.polls.reopen',
    'god.polls.override_result',
    'god.workflow.set_task_status',
    'god.workflow.reassign_task',
    'god.workflow.set_baton',
    'god.workflow.resolve_dual_approval',
  ],
  'admin.support': [
    'admin.dashboard',
    'admin.users.list',
    'admin.leads.list',
    'admin.submissions.list',
  ],
  'admin.sales': [
    'admin.dashboard',
    'admin.leads.list',
    'admin.leads.update',
  ],
}

export function can(roleKeys: RoleKey[], action: Action): boolean {
  return roleKeys.some(rk => (map[rk] ?? []).includes(action))
}
