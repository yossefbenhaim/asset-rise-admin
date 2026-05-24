import { Link } from 'react-router-dom'
import { Mail, Inbox, Users, Building2 } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody } from '@/components/ui/Card'
import { useUser } from '@/lib/auth/session'

export default function AdminHome() {
  const user = useUser()
  const summary = trpc.summary.dashboard.useQuery()
  const s = summary.data

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <div>
          <h1>שלום {user?.full_name?.split(' ')[0] ?? ''}</h1>
          <div className="sub">לוח בקרת CRM</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard to="/leads"       icon={<Mail size={20} />}      label="פניות חדשות"          value={s?.leads_new} />
        <MetricCard to="/submissions" icon={<Inbox size={20} />}     label="פניות בניין פתוחות" value={s?.submissions_open} />
        <MetricCard to="/users"       icon={<Users size={20} />}     label="משתמשים"              value={s?.users_total} />
        <MetricCard to="/buildings"   icon={<Building2 size={20} />} label="בניינים"               value={s?.buildings_total} />
      </div>
    </div>
  )
}

function MetricCard({
  to, icon, label, value,
}: { to: string; icon: React.ReactNode; label: string; value: number | undefined }) {
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <Card>
        <CardBody>
          <div className="flex items-center gap-3">
            <div className="text-sc-primary">{icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-sc-text-secondary">{label}</div>
              <div className="text-[24px] font-bold text-sc-text">
                {value === undefined ? '—' : value}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </Link>
  )
}
