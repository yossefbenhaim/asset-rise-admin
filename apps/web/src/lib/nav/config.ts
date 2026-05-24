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
]
