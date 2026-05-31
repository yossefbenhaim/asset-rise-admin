import { TRPCError } from '@trpc/server'
import {
  GodNegotiationListInput,
  GodNegotiationGetInput,
  GodNegForceStageInput,
  GodNegForceStatusInput,
  GodNegLinkProviderInput,
  GodNegUnlinkProviderInput,
} from '@asset-rise/shared/schemas/godNegotiations'
import { router, requireLevel } from '../../trpc.js'
import { godProcedure, godMutation } from '../../lib/god.js'
import {
  listNegotiations,
  getNegotiation,
  loadNegotiationTarget,
  forceStage,
  forceStatus,
  linkProvider,
  unlinkProvider,
  providerIsLinked,
  PG_UNIQUE_VIOLATION,
  PG_FK_VIOLATION,
} from '../../repos/godNegotiations.repo.js'

// God-mode "Provider Negotiations" router (Wave 2 — "deals"). READS gate on
// requireLevel('admin.super') (direct roleKey membership, the same pattern as
// routers/god/_index.ts). WRITES go through godProcedure + godMutation so every
// attempt/outcome is audited around the service-role write (the airtight pattern
// from lib/god.ts). This is an ISOLATED sibling router — the integration step
// merges it into the god router. It does NOT touch _root.ts / _index.ts.
//
// IMPORTANT — god overrides bypass the normal flow. The silver-castle path
// finalizes a negotiation through openMutualPoll → the tenant vote →
// negotiation-finalize.ts (which flips status, sets stage='linked' and inserts
// sc_project_providers). The writes here set status/stage and insert/delete
// sc_project_providers DIRECTLY via service-role, with NO poll and NO tenant
// vote. forceStatus(confirmed|rejected|cancelled) and link/unlink are exactly
// the result-overriding ops the spec calls out; they are audited and the
// destructive unlink is additionally gated by a DangerConfirm in the UI.

const PG_FK_VIOLATION_NAME = PG_FK_VIOLATION

// PostgREST/Postgres "undefined column" codes — 42703 is the raw Postgres
// SQLSTATE, PGRST204 the PostgREST schema-cache miss. Either means a write
// referenced a column the table doesn't have (schema drift). We translate it to
// a Hebrew BAD_REQUEST instead of letting it fall through to a raw 500.
const PG_UNDEFINED_COLUMN = '42703'
const PGRST_UNDEFINED_COLUMN = 'PGRST204'

function isUniqueViolation(e: unknown): boolean {
  return (e as any)?.code === PG_UNIQUE_VIOLATION
}
function isFkViolation(e: unknown): boolean {
  return (e as any)?.code === PG_FK_VIOLATION_NAME
}
function isUndefinedColumn(e: unknown): boolean {
  const code = (e as any)?.code
  return code === PG_UNDEFINED_COLUMN || code === PGRST_UNDEFINED_COLUMN
}

function notFound(): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'המשא ומתן לא נמצא' })
}

// Re-throw a repo error as a Hebrew TRPCError. NOT_FOUND sentinel → 404, an
// undefined-column / schema-drift error → 400 (never a raw 500), anything else
// → 500 with the underlying message.
function rethrow(e: unknown): never {
  if (e instanceof TRPCError) throw e
  if (e instanceof Error && e.message === 'NOT_FOUND') notFound()
  if (isUndefinedColumn(e)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'מבנה הטבלה אינו תואם לפעולה (עמודה חסרה) — פנה/י לתמיכה',
    })
  }
  const message = e instanceof Error ? e.message : 'שגיאה בלתי צפויה'
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
}

// Resolve project/provider/type for a link/unlink write: prefer the explicit
// input, fall back to the negotiation's own columns. Throws Hebrew errors when a
// required field can't be resolved.
async function resolveLinkArgs(
  db: Parameters<typeof loadNegotiationTarget>[0],
  input: { id: string; project_id?: string; provider_id?: string; provider_type?: string },
): Promise<{ project_id: string; provider_id: string; provider_type: string }> {
  const neg = await loadNegotiationTarget(db, input.id)
  const project_id = input.project_id ?? neg.project_id ?? undefined
  const provider_id = input.provider_id ?? neg.provider_id ?? undefined
  const provider_type = input.provider_type ?? neg.provider_type ?? undefined
  if (!project_id) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'למשא ומתן אין פרויקט משויך' })
  }
  if (!provider_id) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'למשא ומתן אין ספק משויך' })
  }
  if (!provider_type) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'חסר סוג ספק לשיוך' })
  }
  return { project_id, provider_id, provider_type }
}

export const godNegotiationsRouter = router({
  // ── Reads ──────────────────────────────────────────────────────────────────
  list: requireLevel('admin.super')
    .input(GodNegotiationListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listNegotiations(ctx.db, input)
      } catch (e) {
        rethrow(e)
      }
    }),

  get: requireLevel('admin.super')
    .input(GodNegotiationGetInput)
    .query(async ({ ctx, input }) => {
      try {
        const n = await getNegotiation(ctx.db, input.id)
        if (!n) notFound()
        return n
      } catch (e) {
        rethrow(e)
      }
    }),

  // ── Writes (all audited via godMutation) ─────────────────────────────────────
  // forceStage — set the stage to any of the 9. Pure override; does not touch
  // sc_project_providers or the poll.
  forceStage: godProcedure
    .input(GodNegForceStageInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.negotiations.force_stage',
          target_type: 'negotiation',
          target_id: input.id,
          meta: { stage: input.stage },
        },
        async () => {
          try {
            return await forceStage(ctx.db, input)
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  // forceStatus — set the status to any of the 6. Forcing
  // confirmed/rejected/cancelled BYPASSES the tenant poll (no openMutualPoll, no
  // vote, no finalize). The override is recorded with bypass_poll:true in the
  // audit meta. Linking the provider record is a SEPARATE explicit op
  // (linkProvider) so this never silently mutates sc_project_providers.
  forceStatus: godProcedure
    .input(GodNegForceStatusInput)
    .mutation(({ ctx, input }) => {
      const overriding =
        input.status === 'confirmed' ||
        input.status === 'rejected' ||
        input.status === 'cancelled'
      return godMutation(
        ctx,
        {
          action: 'god.negotiations.force_status',
          target_type: 'negotiation',
          target_id: input.id,
          meta: { status: input.status, bypass_poll: overriding },
        },
        async () => {
          try {
            return await forceStatus(ctx.db, input)
          } catch (e) {
            rethrow(e)
          }
        },
      )
    }),

  // linkProvider — INSERT sc_project_providers(project_id, provider_id,
  // provider_type) directly, bypassing openMutualPoll/finalize. Defaults the
  // fields from the negotiation when omitted. A duplicate link → friendly 409;
  // a bad provider/project id → friendly 400.
  linkProvider: godProcedure
    .input(GodNegLinkProviderInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.negotiations.link_provider',
          target_type: 'negotiation',
          target_id: input.id,
          meta: {
            project_id: input.project_id,
            provider_id: input.provider_id,
            provider_type: input.provider_type,
            bypass_poll: true,
          },
        },
        async () => {
          const args = await resolveLinkArgs(ctx.db, input)
          if (await providerIsLinked(ctx.db, args.project_id, args.provider_id)) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'הספק כבר מקושר לפרויקט',
            })
          }
          try {
            const linked = await linkProvider(ctx.db, args)
            // linkProvider upserts with ignoreDuplicates, so a row that already
            // existed (a race past the precheck above) returns null instead of
            // a 23505. Surface that as the same friendly CONFLICT.
            if (!linked) {
              throw new TRPCError({ code: 'CONFLICT', message: 'הספק כבר מקושר לפרויקט' })
            }
            return linked
          } catch (e) {
            if (isUniqueViolation(e)) {
              throw new TRPCError({ code: 'CONFLICT', message: 'הספק כבר מקושר לפרויקט' })
            }
            if (isFkViolation(e)) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'הספק או הפרויקט שנבחרו אינם קיימים במערכת',
              })
            }
            rethrow(e)
          }
        },
      ),
    ),

  // unlinkProvider — DELETE the sc_project_providers row (DESTRUCTIVE). The
  // interlock (resolve + non-empty confirm token) runs INSIDE godMutation so a
  // rejected/probing attempt is also audited.
  unlinkProvider: godProcedure
    .input(GodNegUnlinkProviderInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.negotiations.unlink_provider',
          target_type: 'negotiation',
          target_id: input.id,
          meta: {
            project_id: input.project_id,
            provider_id: input.provider_id,
            confirm: input.confirm,
            bypass_poll: true,
          },
        },
        async () => {
          if (!input.confirm.trim()) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'נדרש אישור להסרת השיוך' })
          }
          // Resolve project+provider for the delete (provider_type is irrelevant
          // here — the row is matched by project_id + provider_id). Prefer the
          // explicit input, fall back to the negotiation's own columns.
          const neg = await loadNegotiationTarget(ctx.db, input.id)
          const project_id = input.project_id ?? neg.project_id ?? undefined
          const provider_id = input.provider_id ?? neg.provider_id ?? undefined
          if (!project_id) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'למשא ומתן אין פרויקט משויך' })
          }
          if (!provider_id) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'למשא ומתן אין ספק משויך' })
          }
          try {
            const deleted = await unlinkProvider(ctx.db, { project_id, provider_id })
            if (!deleted) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'לא נמצא שיוך ספק להסרה',
              })
            }
            return deleted
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),
})
