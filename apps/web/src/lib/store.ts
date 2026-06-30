// Tiny global UI store (zustand) for cross-cutting admin chrome:
// theme (dark/light), the Cmd+K command palette, and the notification center.
// Server state stays in React Query / tRPC; this is ONLY ephemeral UI state.
import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'ar-admin-theme'

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* ignore */ }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

export function applyTheme(t: Theme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = t
}

interface UiState {
  theme: Theme
  cmdkOpen: boolean
  notifOpen: boolean
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setCmdkOpen: (v: boolean) => void
  setNotifOpen: (v: boolean) => void
}

export const useUi = create<UiState>((set, get) => ({
  theme: initialTheme(),
  cmdkOpen: false,
  notifOpen: false,
  setTheme: (t) => { applyTheme(t); try { localStorage.setItem(THEME_KEY, t) } catch { /* ignore */ }; set({ theme: t }) },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setCmdkOpen: (v) => set({ cmdkOpen: v }),
  setNotifOpen: (v) => set({ notifOpen: v }),
}))

// Apply the persisted/system theme immediately on first import (no FOUC).
applyTheme(useUi.getState().theme)
