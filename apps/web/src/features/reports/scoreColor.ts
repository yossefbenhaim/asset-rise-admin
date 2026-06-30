// Shared score → colour mapping for report cells/badges. Mirrors the analyzer's
// feasibility bands (low/mid/high) onto the admin design tokens.
export function scoreTone(score: number | null | undefined): {
  text: string
  bg: string
  label: string
} {
  if (score == null) return { text: 'text-sc-text-muted', bg: 'bg-sc-bg', label: '—' }
  if (score >= 70) return { text: 'text-sc-success', bg: 'bg-sc-success-bg', label: String(score) }
  if (score >= 45) return { text: 'text-sc-gold', bg: 'bg-sc-cream', label: String(score) }
  return { text: 'text-sc-danger', bg: 'bg-sc-danger-bg', label: String(score) }
}
