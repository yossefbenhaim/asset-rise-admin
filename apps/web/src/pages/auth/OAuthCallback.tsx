import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/lib/auth/session'

// Lands here right after Google OAuth returns the user to the app.
// Sends admins home, everyone else back to /login (this app is admin-only).
export default function OAuthCallback() {
  const nav = useNavigate()
  const { auth } = useSession()

  useEffect(() => {
    if (auth.state === 'loading') return
    if (auth.state === 'authenticated') {
      if (auth.user.role === 'admin') nav('/', { replace: true })
      else nav('/login', { replace: true })
      return
    }
    if (auth.state === 'needs_registration') {
      // No self-signup for admins — they're created manually in the DB.
      nav('/login', { replace: true })
      return
    }
    nav('/login', { replace: true })
  }, [auth, nav])

  return (
    <div className="min-h-screen flex items-center justify-center text-sc-text-secondary text-[14px]">
      מתחבר...
    </div>
  )
}
