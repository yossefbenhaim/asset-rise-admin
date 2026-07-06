import { Bell, LogOut, Menu, Search } from 'lucide-react'
import { useSession } from '@/lib/auth/session'
import { useNavigate } from 'react-router-dom'
import { useUi } from '@/lib/store'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useNotifCount } from '@/components/notifications/NotificationCenter'

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { signOut } = useSession()
  const nav = useNavigate()
  const setCmdkOpen = useUi(s => s.setCmdkOpen)
  const notifCount = useNotifCount()

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
          <div className="sub">מרכז בקרה</div>
        </div>
      </div>

      {/* Global search trigger → opens the Cmd+K palette */}
      <button
        onClick={() => setCmdkOpen(true)}
        className="hidden sm:flex items-center gap-2 mx-4 flex-1 max-w-[420px] bg-sc-bg border border-sc-border rounded-sc-input px-3 py-2 text-sc-text-muted hover:border-sc-primary transition-colors"
        aria-label="חיפוש גלובלי"
      >
        <Search size={16} />
        <span className="text-[13px]">חיפוש כתובת, משתמש, דוח…</span>
        <kbd className="ms-auto text-[10px] font-bold bg-sc-card border border-sc-border rounded px-1.5 py-0.5">
          ⌘K
        </kbd>
      </button>

      <div className="sc-top__spacer" />

      <ThemeToggle />
      <button
        className="sc-top__icon-btn relative"
        aria-label={notifCount > 0 ? `התראות (${notifCount})` : 'התראות'}
        onClick={() => useUi.getState().setNotifOpen(true)}
      >
        <Bell size={18} />
        {notifCount > 0 && (
          <span className="absolute -top-1 -left-1 min-w-[16px] h-[16px] px-1 grid place-items-center rounded-full bg-sc-danger text-white text-[10px] font-bold leading-none tabular-nums">
            {notifCount > 99 ? '99+' : notifCount}
          </span>
        )}
      </button>
      <button
        className="sc-top__icon-btn"
        aria-label="התנתק"
        onClick={async () => {
          await signOut()
          nav('/login', { replace: true })
        }}
      >
        <LogOut size={18} />
      </button>
    </header>
  )
}
