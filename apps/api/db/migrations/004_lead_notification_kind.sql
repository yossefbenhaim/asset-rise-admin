-- 004 — Extend sc_notifications.kind CHECK to allow CRM events.
-- Adds: 'lead.received', 'submission.escalated'.
-- (Existing kinds copied from the latest Silver Castle migration; this list
-- must stay in sync with whatever Silver Castle adds going forward.)

do $$ begin
  alter table sc_notifications drop constraint if exists sc_notifications_kind_check;
  alter table sc_notifications add constraint sc_notifications_kind_check
    check (kind in (
      -- Silver Castle baseline (m013 + m015..019 + m038/039)
      'chat.message','poll.opened','poll.finalized','election.finalized',
      'submission.received','submission.resolved','tender.opened','tender.awarded',
      'tender.bid_received','tender.bid_withdrawn','tender.lost','tender.new_bid','tender.bid_lost',
      'document.uploaded','provider.invited','invitation.responded','invitation.cancelled',
      'inspection.submitted','rating.received',
      'negotiation.started','negotiation.message','negotiation.agreed',
      'negotiation.cancelled','negotiation.confirmed','negotiation.rejected',
      'task.assigned','task.done',
      'service_call_new','service_call_assigned','service_call_accepted',
      'service_call_in_progress','service_call_done','service_call_cancelled',
      'project.stage.ready','project.stage.advanced',
      'project.task.assigned','project.task.completed','project.task.overdue',
      'baton.proposed','baton.handed_over',
      'dual_approval.requested','dual_approval.approved','dual_approval.rejected',
      -- Asset Rise (admin/CRM)
      'lead.received','submission.escalated'
    )) not valid;
end $$;
