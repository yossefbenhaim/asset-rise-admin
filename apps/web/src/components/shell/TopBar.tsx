import { LogOut, Menu } from 'lucide-react'
import { useSession } from '@/lib/auth/session'
import { useNavigate } from 'react-router-dom'

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { signOut } = useSession()
  const nav = useNavigate()
  return (
    <header className="sc-top">
      <button
        className="sc-top__icon-btn sc-top__menu"
        onClick={onMenuClick}
        aria-label="פתח תפריט"
      >
        <Menu size={20} />
      </button>
      <div className="sc-top__brand">
        <div className="mk">AR</div>
        <div className="text">
          <div className="name">Asset Rise Admin</div>
          <div className="sub">לוח בקרה</div>
        </div>
      </div>
      <div className="sc-top__spacer" />
      <button
        className="sc-top__icon-btn"
        aria-label="התנתק"
        onClick={async () => { await signOut(); nav('/login', { replace: true }) }}
      >
        <LogOut size={18} />
      </button>
    </header>
  )
}
