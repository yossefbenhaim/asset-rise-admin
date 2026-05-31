import { z } from 'zod'

// God-mode "Tenants + Vaad" domain (Wave 1). All WRITES are super-admin only
// (backend gate = requireLevel('admin.super')) and audited via godMutation.
// These schemas are isolated from the Wave-0 god.ts schema file on purpose.

// ── List / search ────────────────────────────────────────────────────────────
// Searches tenants by name/email/phone (sc_profiles) plus building address
// (sc_buildings via sc_tenant_profiles.building_id). Min length is NOT enforced
// here — an empty query lists the most-recent tenants (capped by limit).
export const GodTenantListInput = z.object({
  q: z.string().max(120).optional(),
  building_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(500).default(200),
})
export type GodTenantListInput = z.infer<typeof GodTenantListInput>

export interface GodTenantListItem {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  role: string | null
  building_id: string | null
  building_label: string | null
  apartment_number: string | null
  is_committee_chair: boolean
  is_committee_member: boolean
  is_organizer: boolean
}

// ── Detail ────────────────────────────────────────────────────────────────────
export const GodTenantGetInput = z.object({ id: z.string().uuid() })
export type GodTenantGetInput = z.infer<typeof GodTenantGetInput>

export interface GodBuildingOption {
  id: string
  label: string
}

export interface GodTenantDetail {
  // sc_profiles
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  role: string | null
  provider_type: string | null
  created_at: string | null
  banned: boolean
  // sc_tenant_profiles (full row, or null if the tenant has no tenant profile)
  tenant_profile: Record<string, unknown> | null
  // resolved building address for the tenant's building_id, if any
  building_label: string | null
}

// ── Writes ────────────────────────────────────────────────────────────────────
// editTenantProfile — full_name/phone live on sc_profiles; apartment_number/
// ownership_percentage live on sc_tenant_profiles. All fields optional so the
// caller can patch a subset. ownership_percentage 0..100 (numeric in DB).
export const GodEditTenantProfileInput = z.object({
  id: z.string().uuid(),
  full_name: z.string().max(200).optional(),
  phone: z.string().max(40).nullable().optional(),
  apartment_number: z.string().max(40).nullable().optional(),
  ownership_percentage: z.number().min(0).max(100).nullable().optional(),
})
export type GodEditTenantProfileInput = z.infer<typeof GodEditTenantProfileInput>

// setVaadRoles — "change the vaad". Toggles the three committee/organizer flags
// on sc_tenant_profiles. All optional; only provided flags are written.
export const GodSetVaadRolesInput = z.object({
  id: z.string().uuid(),
  is_committee_chair: z.boolean().optional(),
  is_committee_member: z.boolean().optional(),
  is_organizer: z.boolean().optional(),
})
export type GodSetVaadRolesInput = z.infer<typeof GodSetVaadRolesInput>

// moveBuilding — relocate a tenant to another building (sc_tenant_profiles.building_id).
export const GodMoveBuildingInput = z.object({
  id: z.string().uuid(),
  building_id: z.string().uuid(),
})
export type GodMoveBuildingInput = z.infer<typeof GodMoveBuildingInput>

// setBanned — reversible Supabase auth ban (reuses users.ts disable pattern).
export const GodSetTenantBannedInput = z.object({
  id: z.string().uuid(),
  banned: z.boolean(),
})
export type GodSetTenantBannedInput = z.infer<typeof GodSetTenantBannedInput>

// deleteTenant — HARD delete (sc_profiles + auth user). UI types the email to
// confirm; the API re-checks the email matches the target as a server-side
// interlock so a stale/forged id can't be deleted by typing an arbitrary email.
export const GodDeleteTenantInput = z.object({
  id: z.string().uuid(),
  confirm_email: z.string().max(200),
})
export type GodDeleteTenantInput = z.infer<typeof GodDeleteTenantInput>
