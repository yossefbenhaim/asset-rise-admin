import { z } from 'zod'

// God-mode "Providers" domain (Wave 1). All WRITES are super-admin only
// (backend gate = requireLevel('admin.super')) and audited via godMutation.
// Isolated from the other god schema files on purpose — the integration step
// re-exports this from packages/shared/src/index.ts.
//
// A provider is a sc_profiles row with role='provider'. provider_type
// discriminates which per-type table (if any) carries license/specialization
// detail. coordinator + generic have NO per-type table — only sc_provider_profiles.

// Canonical provider types — mirrors silver-castle ProviderType (types/role.ts).
export const PROVIDER_TYPES = [
  'architect',
  'appraiser',
  'lawyer',
  'developer',
  'contractor',
  'coordinator',
  'generic',
] as const
export type GodProviderType = (typeof PROVIDER_TYPES)[number]

// Hebrew labels for the provider type — used by the list filter + detail header.
export const PROVIDER_TYPE_LABEL: Record<GodProviderType, string> = {
  architect: 'אדריכל',
  appraiser: 'שמאי',
  lawyer: 'עו״ד',
  developer: 'יזם',
  contractor: 'קבלן',
  coordinator: 'גורם מלווה',
  generic: 'ספק כללי',
}

// Which provider types have a dedicated per-type table. The detail endpoint
// reads the matching table; coordinator/generic resolve to null.
export const PROVIDER_TYPE_TABLE: Record<GodProviderType, string | null> = {
  architect: 'sc_architect_profiles',
  appraiser: 'sc_appraiser_profiles',
  lawyer: 'sc_lawyer_profiles',
  developer: 'sc_developer_profiles',
  contractor: 'sc_contractor_profiles',
  coordinator: null,
  generic: null,
}

// ── List / search ────────────────────────────────────────────────────────────
// Searches providers by name/email/phone (sc_profiles). Optional type + city
// filters. Empty query lists the most-recent providers (capped by limit). City
// matches the per-type "city"/"operating_regions" surfaces only where present
// — for Wave 1 the city filter matches the lawyer city + any provider whose
// name/email contains the term, so it is applied client-side after the embed
// (see repo). Min length is NOT enforced — empty lists recents.
export const GodProviderListInput = z.object({
  q: z.string().max(120).optional(),
  provider_type: z.enum(PROVIDER_TYPES).optional(),
  city: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(500).default(200),
})
export type GodProviderListInput = z.infer<typeof GodProviderListInput>

export interface GodProviderListItem {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  provider_type: GodProviderType | null
  // common provider-card fields (sc_provider_profiles)
  about: string | null
  completed_projects: number | null
  rating_avg: number | null
  rating_count: number | null
  // resolved city for the per-type table (lawyer.city), if any
  city: string | null
}

// ── Detail ────────────────────────────────────────────────────────────────────
export const GodProviderGetInput = z.object({ id: z.string().uuid() })
export type GodProviderGetInput = z.infer<typeof GodProviderGetInput>

export interface GodProviderDetail {
  // sc_profiles
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  role: string | null
  provider_type: GodProviderType | null
  created_at: string | null
  banned: boolean
  // sc_provider_profiles (common card row, or null if absent)
  provider_profile: Record<string, unknown> | null
  // the per-type license/specialization row, or null for coordinator/generic
  // or when the row doesn't exist. The table it came from (for the UI header).
  type_table: string | null
  type_profile: Record<string, unknown> | null
}

// ── Writes ────────────────────────────────────────────────────────────────────
// editProviderProfile — full_name/phone live on sc_profiles; about/
// completed_projects live on sc_provider_profiles. All fields optional so the
// caller can patch a subset. completed_projects is a non-negative integer.
export const GodEditProviderProfileInput = z.object({
  id: z.string().uuid(),
  full_name: z.string().max(200).optional(),
  phone: z.string().max(40).nullable().optional(),
  about: z.string().max(5000).nullable().optional(),
  completed_projects: z.number().int().min(0).max(100000).nullable().optional(),
})
export type GodEditProviderProfileInput = z.infer<typeof GodEditProviderProfileInput>

// setBanned — reversible Supabase auth ban (reuses users.ts disable pattern).
export const GodSetProviderBannedInput = z.object({
  id: z.string().uuid(),
  banned: z.boolean(),
})
export type GodSetProviderBannedInput = z.infer<typeof GodSetProviderBannedInput>
