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
      { id: 'god-buildings', label: 'בניינים (על)', to: '/god/buildings', icon: 'Building2', requires: ['god.buildings.list'] },
      { id: 'god-tenants',   label: 'דיירים וועד',  to: '/god/tenants',   icon: 'Users',     requires: ['god.tenants.list'] },
      { id: 'god-providers', label: 'ספקים (על)',   to: '/god/providers', icon: 'Briefcase', requires: ['god.providers.update'] },
      { id: 'audit',  label: 'יומן ביקורת', to: '/audit',  icon: 'ScrollText', requires: ['god.audit.list'] },
      { id: 'search', label: 'חיפוש גלובלי', to: '/search', icon: 'Search',     requires: ['god.search'] },
    ],
  },
]
