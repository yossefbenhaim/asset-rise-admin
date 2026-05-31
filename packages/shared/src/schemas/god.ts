import { z } from 'zod'

// ── Global search ──────────────────────────────────────────────────────────
// Min length 2 + max 120 bound the ilike scans across sc_* tables.
export const GodSearchInput = z.object({
  q: z.string().min(2).max(120),
})
export type GodSearchInput = z.infer<typeof GodSearchInput>

export type GodSearchHitType = 'user' | 'building' | 'project' | 'lead'

export interface GodSearchHit {
  type: GodSearchHitType
  id: string
  label: string
  sublabel: string | null
  to: string
}

// ── Audit log viewer ────────────────────────────────────────────────────────
export const GodAuditListInput = z.object({
  actor_id: z.string().uuid().optional(),
  action: z.string().max(120).optional(),
  target_type: z.string().max(60).optional(),
  target_id: z.string().max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(500).default(200),
})
export type GodAuditListInput = z.infer<typeof GodAuditListInput>

export interface AuditRow {
  id: string
  actor_id: string | null
  actor_email: string | null
  action: string
  target_type: string | null
  target_id: string | null
  meta: Record<string, unknown> | null
  ip: string | null
  created_at: string
}
