import { GoogleButton } from '@/components/ui/GoogleButton'

export default function Login() {
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
        <p className="sub">היכנסו עם חשבון Google משויך.</p>
        <GoogleButton label="המשך עם Google" />
        <div className="sc-login__help" style={{ marginTop: 20 }}>
          אין לכם גישה? פנו למנהל המערכת.
        </div>
      </div>
    </div>
  )
}
