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
import AdminReports from '@/pages/admin/Reports'
import AdminProcessing from '@/pages/admin/Processing'
import AdminPayments from '@/pages/admin/Payments'
import AdminSources from '@/pages/admin/Sources'
import AdminPipelineRuns from '@/pages/admin/PipelineRuns'
import AdminTestRuns from '@/pages/admin/TestRuns'
import AdminOutreach from '@/pages/admin/Outreach'
import AdminCosts from '@/pages/admin/Costs'
import AdminDevTasks from '@/pages/admin/DevTasks'
import AdminAgents from '@/pages/admin/Agents'
import AdminAgentPage from '@/pages/admin/AgentPage'
import AdminContentDrafts from '@/pages/admin/ContentDrafts'
import AdminMurdock from '@/pages/admin/Murdock'
import AdminAiAnalyst from '@/pages/admin/AiAnalyst'
import AdminWong from '@/pages/admin/Wong'
import AdminLogs from '@/pages/admin/Logs'
import AdminAudit from '@/pages/admin/Audit'
import AdminSearch from '@/pages/admin/Search'
import GodBuildings from '@/pages/admin/god/Buildings'
import GodTenants from '@/pages/admin/god/Tenants'
import GodProviders from '@/pages/admin/god/Providers'
import GodNegotiations from '@/pages/admin/god/Negotiations'
import GodTenders from '@/pages/admin/god/Tenders'
import GodPolls from '@/pages/admin/god/Polls'
import GodWorkflow from '@/pages/admin/god/Workflow'
import GodStuck from '@/pages/admin/god/Stuck'
import GodSupport from '@/pages/admin/god/Support'
import GodDocuments from '@/pages/admin/god/Documents'
import GodChat from '@/pages/admin/god/Chat'
import GodBroadcast from '@/pages/admin/god/Broadcast'
import GodMisc from '@/pages/admin/god/Misc'

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
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <AdminHome /> },
          { path: 'users', element: <AdminUsers /> },
          { path: 'leads', element: <AdminLeads /> },
          { path: 'buildings', element: <AdminBuildings /> },
          { path: 'submissions', element: <AdminSubmissions /> },
          // Control Center
          { path: 'reports', element: <AdminReports /> },
          { path: 'processing', element: <AdminProcessing /> },
          { path: 'payments', element: <AdminPayments /> },
          { path: 'sources', element: <AdminSources /> },
          { path: 'pipeline-runs', element: <AdminPipelineRuns /> },
          { path: 'test-runs', element: <AdminTestRuns /> },
          { path: 'outreach', element: <AdminOutreach /> },
          { path: 'costs', element: <AdminCosts /> },
          { path: 'dev-tasks', element: <AdminDevTasks /> },
          { path: 'agents', element: <AdminAgents /> },
          { path: 'agents/:agentId', element: <AdminAgentPage /> },
          { path: 'content-drafts', element: <AdminContentDrafts /> },
          { path: 'legal', element: <AdminMurdock /> },
          { path: 'ai', element: <AdminAiAnalyst /> },
          { path: 'wong', element: <AdminWong /> },
          { path: 'logs', element: <AdminLogs /> },
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
              { path: 'god/stuck', element: <GodStuck /> },
              { path: 'god/support', element: <GodSupport /> },
              { path: 'god/documents', element: <GodDocuments /> },
              { path: 'god/chat', element: <GodChat /> },
              { path: 'god/broadcast', element: <GodBroadcast /> },
              { path: 'god/misc', element: <GodMisc /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
