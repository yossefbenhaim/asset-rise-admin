import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import {
  GodDocumentListInput,
  GodDocumentGetInput,
  GodDocumentSetVisibilityInput,
  GodDocumentRemoveInput,
} from '@asset-rise/shared'
import { router, requireLevel } from '../../trpc.js'
import { godProcedure, godMutation, logGod } from '../../lib/god.js'
import {
  listDocuments,
  getDocument,
  loadDocumentTarget,
  setVisibility,
  removeDocument,
  PG_CHECK_VIOLATION,
  PG_FK_VIOLATION,
} from '../../repos/godDocuments.repo.js'

// God-mode "Documents" router (Wave 3 — content + comms). READS gate on
// requireLevel('admin.super') (direct roleKey membership, the same pattern as
// routers/god/_index.ts). WRITES go through godProcedure + godMutation so every
// attempt/outcome is audited around the service-role write (the airtight
// pattern from lib/god.ts). This is an ISOLATED sibling router — the
// integration step merges it into the god router. It does NOT touch
// _root.ts / _index.ts.
//
// Scope: list ALL sc_tenant_documents across buildings/projects (filter by
// building/project/kind/source/visibility), drill into one (+ uploader/owner/
// source label, storage path shown READ-ONLY), and two audited writes:
//   setVisibility  — override who sees a doc (writes sc_tenant_documents.
//                    visibility; the column exists, migration 024). Exposing a
//                    doc more widely (non-private target) is gated by a
//                    DangerConfirm in the UI.
//   removeDocument — SOFT remove. There is NO deleted_at column, so this MARKS
//                    THE DOC HIDDEN (visibility='private' + building_id/
//                    project_id=null + is_confidential=true). DESTRUCTIVE from
//                    the tenants' view → DangerConfirm. NEVER deletes the
//                    storage object, NEVER hard-deletes the row.

// PostgREST/Postgres "undefined column" codes — 42703 is the raw SQLSTATE,
// PGRST204 the PostgREST schema-cache miss. Either means a write referenced a
// column the table doesn't have (schema drift — the #1 risk this wave). We
// translate it to a Hebrew BAD_REQUEST instead of a raw 500.
const PG_UNDEFINED_COLUMN = '42703'
const PGRST_UNDEFINED_COLUMN = 'PGRST204'

function isUndefinedColumn(e: unknown): boolean {
  const code = (e as any)?.code
  return code === PG_UNDEFINED_COLUMN || code === PGRST_UNDEFINED_COLUMN
}
function isCheckViolation(e: unknown): boolean {
  return (e as any)?.code === PG_CHECK_VIOLATION
}
function isFkViolation(e: unknown): boolean {
  return (e as any)?.code === PG_FK_VIOLATION
}

function notFound(): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'המסמך לא נמצא' })
}

// Re-throw a repo error as a Hebrew TRPCError. NOT_FOUND sentinel → 404, a CHECK
// violation (e.g. non-private visibility without a building) → 400 with a
// specific message, an undefined-column / schema-drift error → 400, an FK
// violation → 400, anything else → 500 with the underlying message.
function rethrow(e: unknown): never {
  if (e instanceof TRPCError) throw e
  if (e instanceof Error && e.message === 'NOT_FOUND') notFound()
  if (isCheckViolation(e)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'לא ניתן להחיל את החשיפה — מסמך שאינו פרטי חייב להיות משויך לבניין',
    })
  }
  if (isUndefinedColumn(e)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'מבנה הטבלה אינו תואם לפעולה (עמודה חסרה) — פנה/י לתמיכה',
    })
  }
  if (isFkViolation(e)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'אחת מההפניות במסמך אינה קיימת במערכת',
    })
  }
  const message = e instanceof Error ? e.message : 'שגיאה בלתי צפויה'
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
}

export const godDocumentsRouter = router({
  // ── Reads ──────────────────────────────────────────────────────────────────
  list: requireLevel('admin.super')
    .input(GodDocumentListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listDocuments(ctx.db, input)
      } catch (e) {
        rethrow(e)
      }
    }),

  get: requireLevel('admin.super')
    .input(GodDocumentGetInput)
    .query(async ({ ctx, input }) => {
      try {
        const d = await getDocument(ctx.db, input.id)
        if (!d) notFound()
        return d
      } catch (e) {
        rethrow(e)
      }
    }),

  // signedUrl — issue a short-lived (read-only) Supabase storage signed URL for
  // a document's stored object, so the admin can PREVIEW/OPEN the actual file
  // without the bucket having to be public. READ-ONLY: it never mutates the row
  // or the storage object, so it gates on requireLevel (no godMutation/audit).
  // The docs live in the 'documents' bucket; sc_tenant_documents.storage_path
  // is the bucket-relative key (e.g. 'silver-castle/{userId}/{category}/...').
  signedUrl: requireLevel('admin.super')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      let path: string | null
      try {
        const d = await getDocument(ctx.db, input.id)
        if (!d) notFound()
        path = d.storage_path ?? null
      } catch (e) {
        rethrow(e)
      }
      if (!path) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'למסמך אין קובץ מאוחסן (נתיב אחסון חסר)',
        })
      }
      // 5-minute signed URL — enough to preview, short enough to not leak.
      // Dual-read during the storage-prefix migration grace period: if the
      // recorded key fails (e.g. a row still on the old prefix, or vice versa),
      // retry the alternate prefix before giving up.
      const altOf = (k: string): string | null =>
        k.startsWith('asset-rise/')
          ? 'silver-castle/' + k.slice('asset-rise/'.length)
          : k.startsWith('silver-castle/')
            ? 'asset-rise/' + k.slice('silver-castle/'.length)
            : null
      let signed = await ctx.db.storage.from('documents').createSignedUrl(path, 60 * 5)
      if (signed.error || !signed.data?.signedUrl) {
        const alt = altOf(path)
        if (alt) signed = await ctx.db.storage.from('documents').createSignedUrl(alt, 60 * 5)
      }
      if (signed.error || !signed.data?.signedUrl) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'לא ניתן להפיק קישור לקובץ — ייתכן שהקובץ אינו קיים באחסון',
        })
      }
      return { url: signed.data.signedUrl, storage_path: path }
    }),

  // ── Writes (all audited via godMutation) ─────────────────────────────────────
  // setVisibility — override who can see a doc. The precondition (a non-private
  // target needs a building_id) runs INSIDE the write fn so a rejected attempt is
  // also audited.
  setVisibility: godProcedure.input(GodDocumentSetVisibilityInput).mutation(({ ctx, input }) =>
    godMutation(
      ctx,
      {
        action: 'god.documents.set_visibility',
        target_type: 'document',
        target_id: input.id,
        meta: { visibility: input.visibility, confirm: input.confirm ?? null },
      },
      async () => {
        const target = await loadDocumentTarget(ctx.db, input.id).catch(() => null)
        if (!target) notFound()
        // Migration 024 CHECK: a non-'private' visibility MUST carry a
        // building_id. Pre-check it so the operator gets a precise Hebrew
        // error instead of a generic CHECK-violation translation.
        if (input.visibility !== 'private' && !target.building_id) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'אי אפשר לחשוף מסמך שאינו משויך לבניין. שייך/י אותו לבניין תחילה.',
          })
        }
        // Exposing a doc more widely is destructive-ish — the UI passes the
        // typed token; the backend treats it only as a non-empty guard for the
        // non-private targets.
        if (input.visibility !== 'private' && !(input.confirm ?? '').trim()) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'נדרש אישור לשינוי החשיפה' })
        }
        try {
          return await setVisibility(ctx.db, input.id, input.visibility)
        } catch (e) {
          rethrow(e)
        }
      },
    ),
  ),

  // removeDocument — SOFT remove ("mark hidden"). The interlock (non-empty
  // confirm token) runs INSIDE godMutation so a rejected/probing attempt is also
  // audited. The prior visibility/building/project are recorded in the audit meta
  // so the action is hand-reversible.
  removeDocument: godProcedure.input(GodDocumentRemoveInput).mutation(({ ctx, input }) =>
    godMutation(
      ctx,
      {
        action: 'god.documents.remove',
        target_type: 'document',
        target_id: input.id,
        meta: { confirm: input.confirm, soft: true, storage_object_deleted: false },
      },
      async () => {
        if (!input.confirm.trim()) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'נדרש אישור להסרת המסמך' })
        }
        const target = await loadDocumentTarget(ctx.db, input.id).catch(() => null)
        if (!target) notFound()
        // Record the PRIOR values BEFORE the soft-remove nulls them, so the
        // action is reversible from the immutable audit (the remove sets
        // building_id/project_id=null + visibility=private; without this the
        // original association would be unrecoverable from the log).
        await logGod(ctx, {
          action: 'god.documents.remove',
          target_type: 'document',
          target_id: input.id,
          meta: {
            phase: 'prev',
            title: target.title,
            visibility: target.visibility,
            building_id: target.building_id,
            project_id: target.project_id,
          },
        })
        try {
          return await removeDocument(ctx.db, input.id)
        } catch (e) {
          rethrow(e)
        }
      },
    ),
  ),
})
