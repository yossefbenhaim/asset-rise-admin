-- 005 — Extend sc_leads.source CHECK to include 'analyzer'.
-- Used by urban-renewal-analyzer.byclick.co.il when it forwards a captured
-- lead to the CRM (so we can tell where a lead came from at a glance).

alter table sc_leads drop constraint if exists sc_leads_source_check;
alter table sc_leads add constraint sc_leads_source_check
  check (source in ('landing','phone','referral','other','analyzer'));
