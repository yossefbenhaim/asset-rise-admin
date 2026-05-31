import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useSession, useRoleKeys } from '@/lib/auth/session'
import AppShell from './AppShell'
import Login from '@/pages/auth/Login'
import OAuthCallback from '@/pages/auth/OAuthCallback'
import AdminHome from '@/pages/admin/Home'
import AdminUsers from '@/pages/admin/Users'
import AdminLeads from '@/pages/admin/Leads'
import AdminBuildings from '@/pages/admin/Buildings'
import AdminSubmissions from '@/pages/admin/Submissions'
import AdminAudit from '@/pages/admin/Audit'
import AdminSearch from '@/pages/admin/Search'
import GodBuildings from '@/pages/admin/god/Buildings'
import GodTenants from '@/pages/admin/god/Tenants'
import GodProviders from '@/pages/admin/god/Providers'
import GodNegotiations from '@/pages/admin/god/Negotiations'
import GodTenders from '@/pages/admin/god/Tenders'
import GodPolls from '@/pages/admin/god/Polls'
import GodWorkflow from '@/pages/admin/god/Workflow'

// Gate: this entire app is admin-only. Anyone else bounces to /login.
function RequireAdmin() {
  const { auth } = useSession()
  if (auth.state === 'loading') return null
  if (auth.state !== 'authenticated') return <Navigate to="/login" replace />
  if (auth.user.role !== 'admin') return <Navigate to="/login" replace />
  return <Outlet />
}

// Defense-in-depth gate for god-mode pages. The API already enforces this via
// requireLevel('admin.super') on every god endpoint, but this avoids the page
// shell flashing before the query 403s, and keeps non-super admins out entirely.
function RequireSuperAdmin() {
  const roleKeys = useRoleKeys()
  if (!roleKeys.includes('admin.super')) return <Navigate to="/" replace />
  return <Outlet />
}

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/auth/callback', element: <OAuthCallback /> },
  {
    element: <RequireAdmin />,
    children: [{
      element: <AppShell />,
      children: [
        { index: true, element: <AdminHome /> },
        { path: 'users', element: <AdminUsers /> },
        { path: 'leads', element: <AdminLeads /> },
        { path: 'buildings', element: <AdminBuildings /> },
        { path: 'submissions', element: <AdminSubmissions /> },
        {
          element: <RequireSuperAdmin />,
          children: [
            { path: 'audit', element: <AdminAudit /> },
            { path: 'search', element: <AdminSearch /> },
            { path: 'god/buildings', element: <GodBuildings /> },
            { path: 'god/tenants', element: <GodTenants /> },
            { path: 'god/providers', element: <GodProviders /> },
            { path: 'god/negotiations', element: <GodNegotiations /> },
            { path: 'god/tenders', element: <GodTenders /> },
            { path: 'god/polls', element: <GodPolls /> },
            { path: 'god/workflow', element: <GodWorkflow /> },
          ],
        },
      ],
    }],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
