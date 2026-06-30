// Dark/light toggle — flips data-theme on <html> via the UI store (persisted).
import { Moon, Sun } from 'lucide-react'
import { useUi } from '@/lib/store'

export function ThemeToggle() {
  const theme = useUi(s => s.theme)
  const toggle = useUi(s => s.toggleTheme)
  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
      className="grid place-items-center w-9 h-9 rounded-sc-input border border-sc-border bg-sc-card text-sc-text-secondary hover:text-sc-primary hover:border-sc-primary transition-colors"
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
