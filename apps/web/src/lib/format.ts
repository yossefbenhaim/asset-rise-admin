// Hebrew-locale formatters for the admin. Numbers use tabular figures (set
// globally in tokens.css). Currency = ILS. Dates via date-fns + he locale.
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'

const numFmt = new Intl.NumberFormat('he-IL')
const nisFmt = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

export function num(n: number | null | undefined): string {
  return n == null ? '—' : numFmt.format(n)
}
export function nis(n: number | null | undefined): string {
  return n == null ? '—' : nisFmt.format(n)
}
export function pct(n: number | null | undefined, digits = 0): string {
  return n == null ? '—' : `${n.toFixed(digits)}%`
}

function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null
  const dt = typeof d === 'string' ? parseISO(d) : d
  return isNaN(dt.getTime()) ? null : dt
}

export function dateShort(d: string | Date | null | undefined): string {
  const dt = toDate(d); return dt ? format(dt, 'dd/MM/yyyy', { locale: he }) : '—'
}
export function dateTime(d: string | Date | null | undefined): string {
  const dt = toDate(d); return dt ? format(dt, 'dd/MM/yyyy HH:mm', { locale: he }) : '—'
}
export function timeAgo(d: string | Date | null | undefined): string {
  const dt = toDate(d); return dt ? formatDistanceToNow(dt, { locale: he, addSuffix: true }) : '—'
}
