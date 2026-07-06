// The 7-stage pipeline progress bar for one job. Stages before the current
// one render as done (filled), the current one pulses, later ones are idle.
// On a failed job the failed stage turns red with its reason underneath.
//
// NOTE: the current-stage position is DERIVED (per-stage timing isn't
// persisted yet). The parent JobCard surfaces that caveat in copy.
import { motion } from 'framer-motion'
import { Check, X, Loader2 } from 'lucide-react'

type State = 'done' | 'current' | 'failed' | 'idle'

function stateOf(i: number, current: number, status: string): State {
  if (status === 'failed') {
    if (i < current) return 'done'
    if (i === current) return 'failed'
    return 'idle'
  }
  if (status === 'done') return 'done'
  // running
  if (i < current) return 'done'
  if (i === current) return 'current'
  return 'idle'
}

const DOT: Record<State, string> = {
  done: 'bg-sc-success text-white border-sc-success',
  current: 'bg-sc-primary text-white border-sc-primary',
  failed: 'bg-sc-danger text-white border-sc-danger',
  idle: 'bg-white text-sc-text-muted border-sc-border',
}

const CONNECTOR: Record<State, string> = {
  done: 'bg-sc-success',
  current: 'bg-sc-primary/40',
  failed: 'bg-sc-danger',
  idle: 'bg-sc-border',
}

export function StageBar({
  stages,
  current,
  status,
}: {
  stages: readonly string[]
  current: number // 0-based; -1 when not started
  status: string // 'pending' | 'running' | 'done' | 'failed'
}) {
  return (
    <div className="w-full">
      <div className="flex items-center w-full">
        {stages.map((label, i) => {
          const st = stateOf(i, current, status)
          const last = i === stages.length - 1
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none min-w-0">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <motion.span
                  className={`grid place-items-center w-6 h-6 rounded-full border text-[11px] font-bold ${DOT[st]}`}
                  initial={false}
                  animate={st === 'current' ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                  transition={
                    st === 'current'
                      ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
                      : { duration: 0.25 }
                  }
                >
                  {st === 'done' ? (
                    <Check size={13} />
                  ) : st === 'failed' ? (
                    <X size={13} />
                  ) : st === 'current' ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    i + 1
                  )}
                </motion.span>
                <span
                  className={`text-[9.5px] leading-tight text-center max-w-[64px] truncate ${
                    st === 'idle' ? 'text-sc-text-muted' : 'text-sc-text-secondary font-semibold'
                  }`}
                  title={label}
                >
                  {label}
                </span>
              </div>
              {!last && <div className={`h-0.5 flex-1 mx-1 rounded-full -mt-4 ${CONNECTOR[st]}`} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
