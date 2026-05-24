import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/auth/session'

export default function Login() {
  const nav = useNavigate()
  const { refresh } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setErr(null); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (error) {
      setErr(error.message)
      return
    }
    refresh()
    nav('/', { replace: true })
  }

  return (
    <div className="sc-login">
      <div className="sc-login__hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'linear-gradient(135deg,#8b6f47,#a6895f)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 20, color: '#1e3a5f',
            }}
          >AR</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Asset Rise Admin</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>לוח בקרה</div>
          </div>
        </div>
        <div>
          <h1>ניהול המערכת</h1>
          <p>גישה מוגבלת — רק למשתמשים מורשים. אם הגעתם בטעות, חזרו לאזור הראשי.</p>
        </div>
      </div>

      <div className="sc-login__form">
        <h2>כניסת מנהל</h2>
        <p className="sub">הזינו אימייל וסיסמה.</p>

        <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 12, color: 'var(--sc-text-secondary)', marginBottom: 4 }}>אימייל</div>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', font: 'inherit',
                color: 'var(--sc-text)', background: 'var(--sc-bg)',
                border: '1px solid var(--sc-border)', borderRadius: 10, boxSizing: 'border-box',
              }}
            />
          </label>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 12, color: 'var(--sc-text-secondary)', marginBottom: 4 }}>סיסמה</div>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', font: 'inherit',
                color: 'var(--sc-text)', background: 'var(--sc-bg)',
                border: '1px solid var(--sc-border)', borderRadius: 10, boxSizing: 'border-box',
              }}
            />
          </label>

          {err && (
            <div style={{ fontSize: 13, color: 'var(--sc-danger)', textAlign: 'center' }}>{err}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              padding: '10px 16px', fontWeight: 700, borderRadius: 10,
              background: 'var(--sc-primary)', color: '#fff', border: 'none',
              cursor: busy ? 'progress' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >{busy ? 'מתחבר…' : 'כניסה'}</button>
        </form>

        <div className="sc-login__help" style={{ marginTop: 20 }}>
          אין לכם גישה? פנו למנהל המערכת.
        </div>
      </div>
    </div>
  )
}
