import type { Action } from '@asset-rise/shared'

export interface NavItem {
  id: string
  label: string
  to: string
  icon: string
  requires?: Action[]
}

export interface NavGroup {
  group: string
  items: NavItem[]
}

export const ADMIN_NAV: NavGroup[] = [
  {
    group: 'CRM',
    items: [
      { id: 'home',        label: 'לוח בקרה',    to: '/',            icon: 'Home',     requires: ['admin.dashboard'] },
      { id: 'leads',       label: 'פניות לקוחות', to: '/leads',       icon: 'Mail',     requires: ['admin.leads.list'] },
      { id: 'submissions', label: 'פניות בניין',  to: '/submissions', icon: 'Inbox',    requires: ['admin.submissions.list'] },
    ],
  },
  {
    group: 'מרכז בקרה',
    items: [
      { id: 'reports',    label: 'דוחות',       to: '/reports',    icon: 'FileBarChart2', requires: ['admin.reports.list'] },
      { id: 'processing', label: 'ניטור עיבוד',  to: '/processing', icon: 'Activity',      requires: ['admin.processing.view'] },
      { id: 'payments',   label: 'תשלומים',     to: '/payments',   icon: 'CreditCard',    requires: ['admin.payments.list'] },
      { id: 'sources',    label: 'מקורות מידע',  to: '/sources',    icon: 'Radar',         requires: ['admin.sources.view'] },
      { id: 'ai',         label: 'בקרת AI',     to: '/ai',         icon: 'Sparkles',      requires: ['admin.ai.view'] },
      { id: 'logs',       label: 'לוגים',       to: '/logs',       icon: 'FileWarning',   requires: ['admin.logs.list'] },
    ],
  },
  {
    group: 'ניהול',
    items: [
      { id: 'users',     label: 'משתמשים', to: '/users',     icon: 'Users',     requires: ['admin.users.list'] },
      { id: 'buildings', label: 'בניינים',  to: '/buildings', icon: 'Building2', requires: ['admin.buildings.list'] },
    ],
  },
  // 'שליטה' (god-mode) — visible ONLY to the super-admin. Each item gates on a
  // god.* action; Sidebar drops the whole group when no item is visible, so no
  // extra gating code is needed here.
  {
    group: 'שליטה',
    items: [
      { id: 'god-buildings',     label: 'בניינים (על)', to: '/god/buildings',     icon: 'Building2', requires: ['god.buildings.list'] },
      { id: 'god-tenants',       label: 'דיירים וועד',  to: '/god/tenants',       icon: 'Users',     requires: ['god.tenants.list'] },
      { id: 'god-providers',     label: 'ספקים (על)',   to: '/god/providers',     icon: 'Briefcase', requires: ['god.providers.update'] },
      { id: 'god-negotiations',  label: 'משא ומתן (על)', to: '/god/negotiations', icon: 'Handshake', requires: ['god.negotiations.force_status'] },
      { id: 'god-tenders',       label: 'מכרזים (על)',  to: '/god/tenders',       icon: 'Gavel',     requires: ['god.tenders.set_status'] },
      { id: 'god-polls',         label: 'הצבעות (על)',  to: '/god/polls',         icon: 'Vote',      requires: ['god.polls.force_finalize'] },
      { id: 'god-workflow',      label: 'תהליך עבודה (על)', to: '/god/workflow',  icon: 'ListChecks', requires: ['god.workflow.set_task_status'] },
      { id: 'god-documents',     label: 'מסמכים (על)',   to: '/god/documents',  icon: 'FileText',       requires: ['god.documents.set_visibility'] },
      { id: 'god-chat',          label: 'צ׳אטים (על)',   to: '/god/chat',       icon: 'MessagesSquare', requires: ['god.chat.delete_message'] },
      { id: 'god-broadcast',     label: 'שידור הודעות',  to: '/god/broadcast',  icon: 'Megaphone',      requires: ['god.broadcast.send'] },
      { id: 'god-misc',          label: 'ניהול נוסף (על)', to: '/god/misc',     icon: 'ClipboardCheck', requires: ['god.misc.remove_family_member'] },
      { id: 'audit',  label: 'יומן ביקורת', to: '/audit',  icon: 'ScrollText', requires: ['god.audit.list'] },
      { id: 'search', label: 'חיפוש גלובלי', to: '/search', icon: 'Search',     requires: ['god.search'] },
    ],
  },
]
