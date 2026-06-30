// The responsive, framer-motion-staggered grid of SourceCards. Pure layout —
// data + KPIs live in the page.
import { motion } from 'framer-motion'
import type { SourceHealth } from '@asset-rise/shared'
import { SourceCard } from './SourceCard'

export function SourceHealthGrid({ sources }: { sources: SourceHealth[] }) {
  return (
    <motion.div
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 items-stretch"
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
    >
      {sources.map((s, i) => (
        <SourceCard key={s.id} source={s} index={i} />
      ))}
    </motion.div>
  )
}
