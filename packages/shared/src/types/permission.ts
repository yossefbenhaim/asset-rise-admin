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
  // Control Center (operational management of the analyzer/reports pipeline).
  // Seeded by migration 015_admin_control_center_perms; mirrored in the web can().
  | 'admin.reports.list'
  | 'admin.reports.update'
  | 'admin.reports.rerun'
  | 'admin.processing.view'
  | 'admin.payments.list'
  | 'admin.sources.view'
  | 'admin.outreach.view'
  | 'admin.outreach.manage'
  | 'admin.costs.view'
  | 'admin.costs.manage'
  | 'admin.ai.view'
  | 'admin.ai.regenerate'
  | 'admin.ai.edit_prompt'
  | 'admin.logs.list'
  | 'admin.docverify.view'
  // Agents Center (read-only OpenClaw estate dashboard). Seeded by migration 025.
  | 'admin.agents.view'
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
  // god-mode Wave 2 — workflow + deals. Seeded by migration 012_god_wave2_perms.
  | 'god.negotiations.force_stage'
  | 'god.negotiations.force_status'
  | 'god.negotiations.link_provider'
  | 'god.negotiations.unlink_provider'
  | 'god.tenders.set_status'
  | 'god.tenders.force_award'
  | 'god.tenders.cancel'
  | 'god.polls.create'
  | 'god.polls.force_finalize'
  | 'god.polls.reopen'
  | 'god.polls.override_result'
  | 'god.workflow.set_task_status'
  | 'god.workflow.reassign_task'
  | 'god.workflow.set_baton'
  | 'god.workflow.resolve_dual_approval'
  // god-mode Wave 3 — content + communication. Seeded by migration 013_god_wave3_perms.
  | 'god.documents.set_visibility'
  | 'god.documents.remove'
  | 'god.chat.delete_message'
  | 'god.chat.restore_message'
  | 'god.broadcast.send'
  | 'god.broadcast.resend'
  | 'god.misc.remove_family_member'
  | 'god.misc.cancel_inspection'
  | 'god.misc.set_rating_verified'
  | 'god.misc.remove_rating'

export interface Permission {
  role_key: string
  action: Action
  scope: 'own' | 'building' | 'project' | 'all'
}
