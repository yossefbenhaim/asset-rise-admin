import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { useSession } from '@/lib/auth/session'
import AppShell from './AppShell'
import Login from '@/pages/auth/Login'
import OAuthCallback from '@/pages/auth/OAuthCallback'
import AdminHome from '@/pages/admin/Home'
import AdminUsers from '@/pages/admin/Users'
import AdminLeads from '@/pages/admin/Leads'
import AdminBuildings from '@/pages/admin/Buildings'
import AdminSubmissions from '@/pages/admin/Submissions'

// Gate: this entire app is admin-only. Anyone else bounces to /login.
function RequireAdmin() {
  const { auth } = useSession()
  if (auth.state === 'loading') return null
  if (auth.state !== 'authenticated') return <Navigate to="/login" replace />
  if (auth.user.role !== 'admin') return <Navigate to="/login" replace />
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
      ],
    }],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
