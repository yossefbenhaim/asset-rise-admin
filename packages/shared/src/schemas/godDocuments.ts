import { z } from 'zod'

// ── God-mode: Documents (Wave 3 — content + comms) ───────────────────────────
// Zod inputs + response shapes for the super-admin document-control domain.
// Backend gating is requireLevel('admin.super') (direct roleKey membership);
// these schemas only validate payloads. Isolated from the other god schema
// files on purpose — the integration step re-exports this from
// packages/shared/src/index.ts.
//
// Domain model (silver-castle sc_*, GROUND-TRUTHED against
// db/migrations/007_tenant_profile_extended.sql [original CREATE TABLE],
// 024_documents_extended.sql [visibility + building_id/project_id + kind +
// uploaded_by + title], 054_document_source.sql [source_kind/source_id/
// source_label], plus apps/api/src/repos/document.repo.ts):
//   sc_tenant_documents(
//     id, user_id → sc_profiles, uploaded_by → sc_profiles [nullable],
//     building_id → sc_buildings [nullable], project_id → sc_projects [nullable],
//     visibility ∈ ('private','building','provider')  [migration 024 CHECK],
//     kind text, title text, category text [legacy NOT NULL CHECK],
//     source_kind ∈ ('task','negotiation','tender','contract','meeting','manual')
//       [nullable, migration 054 CHECK], source_id uuid, source_label text,
//     file_name, file_size, mime_type, storage_path, file_url,
//     is_confidential bool, created_at, updated_at)
//
//   IMPORTANT — there is NO deleted_at / is_deleted / hidden / archived column
//   on sc_tenant_documents (confirmed across migrations 007/008/024/028/037/
//   041/054). So the god "remove" CANNOT set a deleted_at. Per spec it instead
//   MARKS THE DOCUMENT HIDDEN: visibility := 'private' (drops it out of the
//   building + provider list queries, which all filter visibility != 'private'
//   or by building_id/project_id) AND building_id/project_id := null AND
//   is_confidential := true. The storage object is NEVER touched, and the prior
//   values are recorded in the audit meta so the action is hand-reversible.

// Canonical visibility values (migration 024 CHECK). Mirrors silver-castle
// DocumentVisibility (packages/shared/src/types/document.ts).
export const DOCUMENT_VISIBILITIES = ['private', 'building', 'provider'] as const
export type GodDocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number]

export const DOCUMENT_VISIBILITY_LABEL: Record<GodDocumentVisibility, string> = {
  private: 'פרטי (מעלה בלבד)',
  building: 'בניין (כל הדיירים)',
  provider: 'ספק (פרויקט)',
}

// Canonical source kinds (migration 054 CHECK). 'manual' = uploaded directly.
export const DOCUMENT_SOURCE_KINDS = [
  'task',
  'negotiation',
  'tender',
  'contract',
  'meeting',
  'manual',
] as const
export type GodDocumentSourceKind = (typeof DOCUMENT_SOURCE_KINDS)[number]

export const DOCUMENT_SOURCE_KIND_LABEL: Record<GodDocumentSourceKind, string> = {
  task: 'משימה',
  negotiation: 'משא ומתן',
  tender: 'מכרז',
  contract: 'חוזה',
  meeting: 'פגישה',
  manual: 'העלאה ידנית',
}

// kind is free-form-ish (no DB CHECK on `kind` itself; the legacy `category`
// column has the CHECK). The UI labels the well-known values and falls back to
// the raw value. We do NOT constrain it in the schema for the same reason.
export const DOCUMENT_KIND_LABEL: Record<string, string> = {
  contract: 'חוזה',
  certificate: 'תעודה',
  plan: 'תוכנית',
  report: 'דוח',
  protocol: 'פרוטוקול',
  financial: 'פיננסי',
  insurance: 'ביטוח',
  tabu: 'נסח טאבו',
  ownership_certificate: 'אישור בעלות',
  purchase_contract: 'חוזה רכישה',
  inheritance: 'ירושה',
  power_of_attorney: 'ייפוי כוח',
  other: 'אחר',
}

// ── List / search ────────────────────────────────────────────────────────────
// Lists ALL sc_tenant_documents across buildings/projects with the resolved
// uploader + building address + project name. Optional building/kind/source/
// visibility filters + a free-text term (matches title / file_name / source_
// label / resolved building address / uploader name). Empty query lists the
// most-recent documents (capped by limit). Min length is NOT enforced.
export const GodDocumentListInput = z.object({
  q: z.string().max(160).optional(),
  building_id: z.string().uuid().optional(),
  project_id: z.string().uuid().optional(),
  kind: z.string().max(80).optional(),
  source_kind: z.enum(DOCUMENT_SOURCE_KINDS).optional(),
  visibility: z.enum(DOCUMENT_VISIBILITIES).optional(),
  limit: z.number().int().min(1).max(500).default(200),
})
export type GodDocumentListInput = z.infer<typeof GodDocumentListInput>

export interface GodDocumentListItem {
  id: string
  title: string | null
  file_name: string | null
  kind: string | null
  visibility: GodDocumentVisibility | null
  source_kind: GodDocumentSourceKind | null
  source_label: string | null
  is_confidential: boolean
  created_at: string | null
  building_id: string | null
  building_address: string | null
  project_id: string | null
  project_name: string | null
  // Resolved uploader (sc_profiles.full_name / email), or null when uploaded_by
  // is null / unresolved.
  uploaded_by: string | null
  uploader_name: string | null
  uploader_email: string | null
}

// ── Detail ────────────────────────────────────────────────────────────────────
export const GodDocumentGetInput = z.object({ id: z.string().uuid() })
export type GodDocumentGetInput = z.infer<typeof GodDocumentGetInput>

export interface GodDocumentDetail {
  id: string
  title: string | null
  file_name: string | null
  kind: string | null
  category: string | null
  visibility: GodDocumentVisibility | null
  source_kind: GodDocumentSourceKind | null
  source_id: string | null
  source_label: string | null
  is_confidential: boolean
  mime_type: string | null
  file_size: number | null
  // The storage path is shown READ-ONLY for traceability — god never touches
  // the storage object, only the DB row.
  storage_path: string | null
  file_url: string | null
  created_at: string | null
  updated_at: string | null
  building_id: string | null
  building_address: string | null
  project_id: string | null
  project_name: string | null
  user_id: string | null
  owner_name: string | null
  owner_email: string | null
  uploaded_by: string | null
  uploader_name: string | null
  uploader_email: string | null
}

// ── Writes ────────────────────────────────────────────────────────────────────
// setVisibility — override who can see a document by writing
// sc_tenant_documents.visibility (the column exists; migration 024). Changing a
// 'private' doc to 'building'/'provider' EXPOSES it more widely, so the UI gates
// the non-private targets behind a DangerConfirm. The backend treats `confirm`
// only as a non-empty guard for those targets; setting visibility back to
// 'private' is not destructive and needs no token (confirm optional).
//
// NOTE: migration 024 also adds a CHECK that a non-'private' visibility MUST
// carry a building_id. The repo enforces this with a Hebrew precondition error
// (rather than letting the DB CHECK surface as a raw 500) when a doc has no
// building_id and the operator picks building/provider.
export const GodDocumentSetVisibilityInput = z.object({
  id: z.string().uuid(),
  visibility: z.enum(DOCUMENT_VISIBILITIES),
  confirm: z.string().max(400).optional(),
})
export type GodDocumentSetVisibilityInput = z.infer<typeof GodDocumentSetVisibilityInput>

// removeDocument — SOFT remove. There is NO deleted_at column, so this MARKS
// THE DOCUMENT HIDDEN: visibility := 'private', building_id := null,
// project_id := null, is_confidential := true. It drops out of every building/
// provider list (which all filter visibility != 'private' or by building_id/
// project_id) while the row + the storage object are preserved. DESTRUCTIVE
// from the tenants' point of view (the doc disappears for everyone but its
// uploader/owner), so the UI gates it behind a DangerConfirm. `confirm` carries
// the typed token from that interlock; the backend treats it only as a
// non-empty guard. We NEVER delete the storage object and NEVER hard-delete the
// row.
export const GodDocumentRemoveInput = z.object({
  id: z.string().uuid(),
  confirm: z.string().min(1).max(400),
})
export type GodDocumentRemoveInput = z.infer<typeof GodDocumentRemoveInput>
