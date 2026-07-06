import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'
import type { SessionUser, RoleKey } from '@asset-rise/shared'
import { trpc } from '@/lib/api/trpc'

export type AuthState =
  | { state: 'loading' }
  | { state: 'anonymous' }
  | {
      state: 'needs_registration'
      supabase: { id: string; email: string | null; full_name: string | null }
    }
  | { state: 'authenticated'; user: SessionUser; roleKeys: RoleKey[] }

interface SessionApi {
  auth: AuthState
  refresh: () => void
  signOut: () => Promise<void>
}

const Ctx = createContext<SessionApi | null>(null)

function clearBrowserAuthState() {
  try {
    localStorage.clear()
  } catch {}
  try {
    sessionStorage.clear()
  } catch {}
  if (typeof document !== 'undefined') {
    const hostParts = window.location.hostname.split('.')
    const domains = [
      window.location.hostname,
      ...hostParts.map((_, i) => '.' + hostParts.slice(i).join('.')),
    ]
    const paths = ['/', window.location.pathname || '/']
    document.cookie.split(';').forEach(raw => {
      const name = raw.split('=')[0]?.trim()
      if (!name) return
      paths.forEach(path => {
        document.cookie = name + '=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + path
        domains.forEach(domain => {
          document.cookie =
            name +
            '=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' +
            path +
            '; domain=' +
            domain
        })
      })
    })
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session)
        setBootstrapping(false)
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => setSession(sess))
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: !bootstrapping,
    retry: false,
    staleTime: 30_000,
  })

  let auth: AuthState
  if (bootstrapping || (!!session && meQuery.isLoading)) {
    auth = { state: 'loading' }
  } else if (!meQuery.data || meQuery.data.state === 'anonymous') {
    auth = { state: 'anonymous' }
  } else if (meQuery.data.state === 'needs_registration') {
    auth = { state: 'needs_registration', supabase: meQuery.data.supabase }
  } else {
    auth = { state: 'authenticated', user: meQuery.data.user, roleKeys: meQuery.data.role_keys }
  }

  const value: SessionApi = {
    auth,
    refresh: () => meQuery.refetch(),
    signOut: async () => {
      try {
        await supabase.auth.signOut()
      } finally {
        clearBrowserAuthState()
        setSession(null)
      }
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSession must be used inside SessionProvider')
  return v
}

// Convenience: returns the authenticated user or null. Throws while loading?
// No — returns null on every non-authenticated state so caller can check.
export function useUser(): SessionUser | null {
  const { auth } = useSession()
  return auth.state === 'authenticated' ? auth.user : null
}

export function useRoleKeys(): RoleKey[] {
  const { auth } = useSession()
  return auth.state === 'authenticated' ? auth.roleKeys : []
}
