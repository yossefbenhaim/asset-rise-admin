import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  GodDocumentListInput,
  GodDocumentListItem,
  GodDocumentDetail,
  GodDocumentVisibility,
} from '@asset-rise/shared'

// God-mode "Documents" repo (Wave 3 — content + comms). Runs as service-role
// (adminClient) so it reads/writes any sc_* row, bypassing RLS. Routers gate
// access; repos only do DB work. All writes are wrapped by godMutation() at the
// router layer.
//
// Backing table: sc_tenant_documents (historical name; conceptually the doc
// store for tenant / chair / provider). GROUND-TRUTHED columns (migrations 007/
// 024/054 + apps/api/src/repos/document.repo.ts in silver-castle):
//   id, user_id, uploaded_by, building_id, project_id, visibility, kind, title,
//   category, source_kind, source_id, source_label, file_name, file_size,
//   mime_type, storage_path, file_url, is_confidential, created_at, updated_at
//
// There is NO deleted_at column. The "remove" write therefore MARKS THE DOC
// HIDDEN (visibility='private' + building_id/project_id=null + is_confidential=
// true) and NEVER touches the storage object — see removeDocument().

// Postgres CHECK-violation SQLSTATE — e.g. a visibility != 'private' write on a
// doc with no building_id trips migration 024's
// sc_tenant_documents_visibility_building_chk. The router translates it to a
// friendly Hebrew message; we also pre-check it in setVisibility() so it rarely
// surfaces.
export const PG_CHECK_VIOLATION = '23514'
// FK-violation SQLSTATE (for symmetry with the other god repos — the writes
// here don't create FKs, but keeping the export lets the router guard uniformly).
export const PG_FK_VIOLATION = '23503'

const COLS =
  'id, user_id, uploaded_by, building_id, project_id, visibility, kind, title, ' +
  'category, source_kind, source_id, source_label, file_name, file_size, ' +
  'mime_type, storage_path, file_url, is_confidential, created_at, updated_at'

function addressOf(
  b:
    | { street?: string | null; building_number?: string | null; city?: string | null }
    | null
    | undefined,
): string | null {
  if (!b) return null
  const line = [b.street, b.building_number].filter(Boolean).join(' ')
  const full = [line, b.city].filter(Boolean).join(', ').trim()
  return full || null
}

async function resolveBuildings(
  db: SupabaseClient,
  ids: string[],
): Promise<
  Map<string, { city: string | null; street: string | null; building_number: string | null }>
> {
  const map = new Map<string, any>()
  if (!ids.length) return map
  const { data } = await db
    .from('sc_buildings')
    .select('id, city, street, building_number')
    .in('id', ids)
  for (const b of (data ?? []) as any[]) map.set(b.id, b)
  return map
}

async function resolveProjects(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { name: string | null }>> {
  const map = new Map<string, any>()
  if (!ids.length) return map
  const { data } = await db.from('sc_projects').select('id, name').in('id', ids)
  for (const p of (data ?? []) as any[]) map.set(p.id, p)
  return map
}

async function resolveProfiles(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, { full_name: string | null; email: string | null }>> {
  const map = new Map<string, any>()
  if (!ids.length) return map
  const { data } = await db.from('sc_profiles').select('id, full_name, email').in('id', ids)
  for (const p of (data ?? []) as any[]) map.set(p.id, p)
  return map
}

// ── List ─────────────────────────────────────────────────────────────────────
// All documents + the resolved building address / project name / uploader.
// Filters by building/project/kind/source_kind/visibility; the free-text term
// matches title / file_name / source_label / resolved building address /
// uploader name (post-resolution, so the search isn't limited to columns the
// documents table carries).
export async function listDocuments(
  db: SupabaseClient,
  input: GodDocumentListInput,
): Promise<GodDocumentListItem[]> {
  let q = db
    .from('sc_tenant_documents')
    .select(COLS)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 200)

  if (input.building_id) q = q.eq('building_id', input.building_id)
  if (input.project_id) q = q.eq('project_id', input.project_id)
  if (input.kind) q = q.eq('kind', input.kind)
  if (input.source_kind) q = q.eq('source_kind', input.source_kind)
  if (input.visibility) q = q.eq('visibility', input.visibility)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]
  if (!rows.length) return []

  const buildingIds = new Set<string>()
  const projectIds = new Set<string>()
  const profileIds = new Set<string>()
  for (const r of rows) {
    if (r.building_id) buildingIds.add(r.building_id)
    if (r.project_id) projectIds.add(r.project_id)
    if (r.uploaded_by) profileIds.add(r.uploaded_by)
  }

  const [buildingById, projectById, profileById] = await Promise.all([
    resolveBuildings(db, Array.from(buildingIds)),
    resolveProjects(db, Array.from(projectIds)),
    resolveProfiles(db, Array.from(profileIds)),
  ])

  let items: GodDocumentListItem[] = rows.map(r => {
    const uploader = r.uploaded_by ? profileById.get(r.uploaded_by) : null
    return {
      id: r.id,
      title: r.title ?? null,
      file_name: r.file_name ?? null,
      kind: r.kind ?? null,
      visibility: (r.visibility ?? null) as GodDocumentVisibility | null,
      source_kind: r.source_kind ?? null,
      source_label: r.source_label ?? null,
      is_confidential: !!r.is_confidential,
      created_at: r.created_at ?? null,
      building_id: r.building_id ?? null,
      building_address: addressOf(buildingById.get(r.building_id) ?? null),
      project_id: r.project_id ?? null,
      project_name: (projectById.get(r.project_id)?.name ?? null) as string | null,
      uploaded_by: r.uploaded_by ?? null,
      uploader_name: uploader?.full_name ?? null,
      uploader_email: uploader?.email ?? null,
    }
  })

  const safe = input.q ? sanitizeTerm(input.q).toLowerCase() : ''
  if (safe) {
    items = items.filter(i =>
      [i.title, i.file_name, i.source_label, i.building_address, i.uploader_name, i.project_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(safe),
    )
  }

  return items
}

// PostgREST treats comma/parens specially and % _ * are LIKE metacharacters —
// strip them so a term can't broaden into a match-everything dump (the search
// is client-side post-resolution, but keep the same hardening as the other god
// repos for consistency).
function sanitizeTerm(q: string): string {
  return q.replace(/[(),%_*\\]/g, ' ').trim()
}

// ── Detail ─────────────────────────────────────────────────────────────────────
// Full row + resolved building address / project name / owner / uploader. The
// storage path/url is returned READ-ONLY for traceability; god never touches the
// storage object.
export async function getDocument(
  db: SupabaseClient,
  id: string,
): Promise<GodDocumentDetail | null> {
  const { data, error } = await db
    .from('sc_tenant_documents')
    .select(COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  // PostgREST returns a loosely-typed row for a string .select(); narrow to any
  // (same pattern as the list query's `as any[]`).
  const d = data as any

  const buildingIds = (d.building_id ? [d.building_id] : []) as string[]
  const projectIds = (d.project_id ? [d.project_id] : []) as string[]
  const profileIds = [d.user_id, d.uploaded_by].filter(Boolean) as string[]

  const [buildingById, projectById, profileById] = await Promise.all([
    resolveBuildings(db, buildingIds),
    resolveProjects(db, projectIds),
    resolveProfiles(db, profileIds),
  ])

  const owner = d.user_id ? profileById.get(d.user_id) : null
  const uploader = d.uploaded_by ? profileById.get(d.uploaded_by) : null

  return {
    id: d.id,
    title: d.title ?? null,
    file_name: d.file_name ?? null,
    kind: d.kind ?? null,
    category: d.category ?? null,
    visibility: (d.visibility ?? null) as GodDocumentVisibility | null,
    source_kind: d.source_kind ?? null,
    source_id: d.source_id ?? null,
    source_label: d.source_label ?? null,
    is_confidential: !!d.is_confidential,
    mime_type: d.mime_type ?? null,
    file_size: d.file_size ?? null,
    storage_path: d.storage_path ?? null,
    file_url: d.file_url ?? null,
    created_at: d.created_at ?? null,
    updated_at: d.updated_at ?? null,
    building_id: d.building_id ?? null,
    building_address: addressOf(buildingById.get(d.building_id) ?? null),
    project_id: d.project_id ?? null,
    project_name: (projectById.get(d.project_id)?.name ?? null) as string | null,
    user_id: d.user_id ?? null,
    owner_name: owner?.full_name ?? null,
    owner_email: owner?.email ?? null,
    uploaded_by: d.uploaded_by ?? null,
    uploader_name: uploader?.full_name ?? null,
    uploader_email: uploader?.email ?? null,
  }
}

// Minimal load for write preconditions: confirm the row exists and return the
// fields the writes need (visibility + building_id + a display label).
export async function loadDocumentTarget(
  db: SupabaseClient,
  id: string,
): Promise<{
  id: string
  visibility: GodDocumentVisibility | null
  building_id: string | null
  project_id: string | null
  title: string | null
  file_name: string | null
}> {
  const { data, error } = await db
    .from('sc_tenant_documents')
    .select('id, visibility, building_id, project_id, title, file_name')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('NOT_FOUND')
  return {
    id: data.id,
    visibility: (data.visibility ?? null) as GodDocumentVisibility | null,
    building_id: data.building_id ?? null,
    project_id: data.project_id ?? null,
    title: data.title ?? null,
    file_name: data.file_name ?? null,
  }
}

// ── setVisibility ──────────────────────────────────────────────────────────────
// Override who can see the document by writing sc_tenant_documents.visibility.
// migration 024 adds a CHECK that a non-'private' visibility MUST carry a
// building_id — the router pre-checks this and raises a Hebrew precondition
// error, but the repo also lets a DB CHECK violation propagate (the router maps
// 23514 → friendly Hebrew) as defense-in-depth.
export async function setVisibility(
  db: SupabaseClient,
  id: string,
  visibility: GodDocumentVisibility,
): Promise<{ ok: true }> {
  const { error } = await db
    .from('sc_tenant_documents')
    .update({ visibility, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) {
    const e: any = error
    const err = new Error(error.message)
    if (e.code) (err as any).code = e.code
    throw err
  }
  return { ok: true }
}

// ── removeDocument (SOFT remove — "mark hidden") ──────────────────────────────
// There is NO deleted_at column on sc_tenant_documents, so a soft remove cannot
// flip a tombstone. Instead we MARK THE DOC HIDDEN so it disappears from every
// building/provider view while the row + the storage object are PRESERVED:
//   visibility    := 'private'  (drops out of the building + provider list
//                                queries, which filter visibility != 'private')
//   building_id   := null       (drops out of any building-scoped list)
//   project_id    := null       (drops out of any provider/project-scoped list)
//   is_confidential := true
// The uploader/owner still sees their own row (the tenant "my docs" query keys
// off uploaded_by/user_id, not visibility) — exactly like a hidden/withdrawn
// document. The prior values are returned so the router records them in the
// audit meta, making the action hand-reversible. We NEVER delete the storage
// object and NEVER hard-delete the row.
export async function removeDocument(
  db: SupabaseClient,
  id: string,
): Promise<{
  ok: true
  prev: {
    visibility: GodDocumentVisibility | null
    building_id: string | null
    project_id: string | null
  }
}> {
  const target = await loadDocumentTarget(db, id)
  const { error } = await db
    .from('sc_tenant_documents')
    .update({
      visibility: 'private',
      building_id: null,
      project_id: null,
      is_confidential: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) {
    const e: any = error
    const err = new Error(error.message)
    if (e.code) (err as any).code = e.code
    throw err
  }
  return {
    ok: true,
    prev: {
      visibility: target.visibility,
      building_id: target.building_id,
      project_id: target.project_id,
    },
  }
}
