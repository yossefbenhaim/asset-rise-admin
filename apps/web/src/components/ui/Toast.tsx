import { Check } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

interface ToastState {
  msg: string
  id: number
}
interface ToastApi {
  show: (msg: string) => void
}
const Ctx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<ToastState | null>(null)
  const show = useCallback((msg: string) => setT({ msg, id: Date.now() }), [])
  useEffect(() => {
    if (!t) return
    const id = setTimeout(() => setT(null), 2400)
    return () => clearTimeout(id)
  }, [t])
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {t && (
        <div className="sc-toast" role="status">
          <Check size={16} /> {t.msg}
        </div>
      )}
    </Ctx.Provider>
  )
}
export function useToast() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast inside ToastProvider')
  return v
}
