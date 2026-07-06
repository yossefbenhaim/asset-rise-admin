// Brand-correct Google sign-in button. White surface, multi-color G.
// Styles live in shell.css under .sc-google-btn (mirrors prototype exactly).
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

export function GoogleButton({ label = 'המשך עם Google' }: { label?: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function go() {
    setErr(null)
    setBusy(true)
    const redirectTo = `${window.location.origin}/auth/callback`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    setBusy(false)
    if (error) setErr(error.message)
  }

  return (
    <>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="sc-google-btn"
        aria-label={label}
      >
        <span className="sc-google-btn__icon" aria-hidden>
          <GoogleG />
        </span>
        <span className="sc-google-btn__label">{busy ? 'מתחבר...' : label}</span>
      </button>
      {err && <div className="text-[12px] text-sc-danger mt-2">{err}</div>}
    </>
  )
}

function GoogleG() {
  return (
    <svg width={20} height={20} viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.165 6.656 3.58 9 3.58z"
      />
    </svg>
  )
}
