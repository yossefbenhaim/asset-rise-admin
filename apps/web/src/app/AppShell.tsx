import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/shell/Sidebar'
import { TopBar } from '@/components/shell/TopBar'
import { BudgetStrip } from '@/components/shell/BudgetStrip'
import { CommandPalette } from '@/components/command/CommandPalette'
import { NotificationCenter } from '@/components/notifications/NotificationCenter'

export default function AppShell() {
  const [sideOpen, setSideOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setSideOpen(false)
  }, [pathname])

  return (
    <div className={'sc-shell' + (sideOpen ? ' sc-side-open' : '')}>
      <Sidebar onNavigate={() => setSideOpen(false)} />
      {sideOpen && (
        <div className="sc-side__overlay" onClick={() => setSideOpen(false)} aria-hidden />
      )}
      <div className="sc-shell__main">
        <BudgetStrip />
        <TopBar onMenuClick={() => setSideOpen(o => !o)} />
        <Outlet />
      </div>
      <CommandPalette />
      <NotificationCenter />
    </div>
  )
}
