import { TRPCError } from '@trpc/server'
import {
  GodFamilyInvitationListInput,
  GodFamilyLinkListInput,
  GodRemoveFamilyMemberInput,
  GodInspectionListInput,
  GodCancelInspectionInput,
  GodRatingListInput,
  GodSetRatingVerifiedInput,
  GodRemoveRatingInput,
  GodCalendarListInput,
} from '@asset-rise/shared/schemas/godMisc'
import { router, requireLevel } from '../../trpc.js'
import { godProcedure, godMutation } from '../../lib/god.js'
import {
  listFamilyInvitations,
  listFamilyLinks,
  removeFamilyMember,
  getFamilyLinkLabels,
  listInspections,
  cancelInspection,
  listRatings,
  setRatingVerified,
  removeRating,
  getRatingLabel,
  listCalendarEvents,
  getMiscCounts,
  PG_FK_VIOLATION,
} from '../../repos/godMisc.repo.js'

// God-mode "Cross-domain Admin / Misc" router (Wave 3 — content + comms). READS
// gate on requireLevel('admin.super') (direct roleKey membership, the same
// pattern as routers/god/_index.ts). WRITES go through godProcedure + godMutation
// so every attempt/outcome is audited around the service-role write (the airtight
// pattern from lib/god.ts). This is an ISOLATED sibling router — the integration
// step merges it into the god router. It does NOT touch _root.ts / _index.ts.
//
// READ-FIRST: cross-building read lists + counts for the remaining domains
// (family, inspections, ratings, calendar/meetings) plus a few targeted, audited
// moderation writes — the destructive ones gated behind a DangerConfirm in the
// UI and a non-empty confirm-token guard in the write fn.
//
// SKIPPED — resolveRatingReport: there is NO sc_rating_reports / rating-report
// table anywhere in the silver-castle migrations (ratings carry only a `verified`
// flag, no report/flag row), so the schema cannot be confirmed and the op is not
// modelled. Noted to integration.

// PostgREST/Postgres "undefined column" codes — 42703 raw SQLSTATE, PGRST204 the
// PostgREST schema-cache miss. Either means a write referenced a missing column
// (schema drift); we translate to a Hebrew BAD_REQUEST, never a raw 500.
const PG_UNDEFINED_COLUMN = '42703'
const PGRST_UNDEFINED_COLUMN = 'PGRST204'

function isFkViolation(e: unknown): boolean {
  return (e as any)?.code === PG_FK_VIOLATION
}
function isUndefinedColumn(e: unknown): boolean {
  const code = (e as any)?.code
  return code === PG_UNDEFINED_COLUMN || code === PGRST_UNDEFINED_COLUMN
}

// Re-throw a repo error as a Hebrew TRPCError. An undefined-column / schema-drift
// error → 400 (never a raw 500); an FK violation → friendly 400; anything else →
// 500 with the underlying message.
function rethrow(e: unknown): never {
  if (e instanceof TRPCError) throw e
  if (isUndefinedColumn(e)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'מבנה הטבלה אינו תואם לפעולה (עמודה חסרה) — פנה/י לתמיכה',
    })
  }
  if (isFkViolation(e)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'לא ניתן לבצע את הפעולה בשל קשר נתונים קיים',
    })
  }
  const message = e instanceof Error ? e.message : 'שגיאה בלתי צפויה'
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
}

export const godMiscRouter = router({
  // ── Counts (header dashboard) ──────────────────────────────────────────────
  counts: requireLevel('admin.super').query(async ({ ctx }) => {
    try {
      return await getMiscCounts(ctx.db)
    } catch (e) {
      rethrow(e)
    }
  }),

  // ── FAMILY ───────────────────────────────────────────────────────────────────
  familyInvitations: requireLevel('admin.super')
    .input(GodFamilyInvitationListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listFamilyInvitations(ctx.db, input)
      } catch (e) {
        rethrow(e)
      }
    }),

  familyLinks: requireLevel('admin.super')
    .input(GodFamilyLinkListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listFamilyLinks(ctx.db, input)
      } catch (e) {
        rethrow(e)
      }
    }),

  // removeFamilyMember — SOFT-remove a family link (set removed_at). DESTRUCTIVE
  // (severs the member's inherited building access). The interlock (non-empty
  // confirm token + already-removed/not-found resolution) runs INSIDE godMutation
  // so a rejected/probing attempt is also audited.
  removeFamilyMember: godProcedure
    .input(GodRemoveFamilyMemberInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.misc.remove_family_member',
          target_type: 'family_link',
          target_id: input.id,
          meta: { confirm: input.confirm },
        },
        async () => {
          if (!input.confirm.trim()) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'נדרש אישור להסרת בן/בת המשפחה' })
          }
          try {
            const link = await getFamilyLinkLabels(ctx.db, input.id)
            if (!link.exists) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'הקישור המשפחתי לא נמצא' })
            }
            if (link.removed) {
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'הקישור המשפחתי כבר הוסר' })
            }
            const removed = await removeFamilyMember(ctx.db, input.id)
            if (!removed) {
              // Lost the race to another remover.
              throw new TRPCError({ code: 'BAD_REQUEST', message: 'הקישור המשפחתי כבר הוסר' })
            }
            return removed
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  // ── INSPECTIONS ────────────────────────────────────────────────────────────────
  inspections: requireLevel('admin.super')
    .input(GodInspectionListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listInspections(ctx.db, input)
      } catch (e) {
        rethrow(e)
      }
    }),

  // cancelInspection — DELETE the inspection row (no 'cancelled' status exists in
  // the CHECK; this removes the report entirely, files cascade). DESTRUCTIVE.
  cancelInspection: godProcedure
    .input(GodCancelInspectionInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.misc.cancel_inspection',
          target_type: 'inspection',
          target_id: input.id,
          meta: { confirm: input.confirm },
        },
        async () => {
          if (!input.confirm.trim()) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'נדרש אישור לביטול הבדיקה' })
          }
          try {
            const deleted = await cancelInspection(ctx.db, input.id)
            if (!deleted) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'הבדיקה לא נמצאה' })
            }
            return deleted
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  // ── RATINGS ──────────────────────────────────────────────────────────────────
  ratings: requireLevel('admin.super')
    .input(GodRatingListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listRatings(ctx.db, input)
      } catch (e) {
        rethrow(e)
      }
    }),

  // setRatingVerified — flip the verified flag (reversible moderation, no
  // DangerConfirm). Audited.
  setRatingVerified: godProcedure
    .input(GodSetRatingVerifiedInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.misc.set_rating_verified',
          target_type: 'provider_rating',
          target_id: input.id,
          meta: { verified: input.verified },
        },
        async () => {
          try {
            const updated = await setRatingVerified(ctx.db, input.id, input.verified)
            if (!updated) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'הדירוג לא נמצא' })
            }
            return updated
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  // removeRating — DELETE the rating row (DESTRUCTIVE). The AFTER trigger
  // recomputes the cached aggregate. DangerConfirm in the UI; non-empty token
  // guard inside the write fn so a probing attempt is also audited.
  removeRating: godProcedure
    .input(GodRemoveRatingInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.misc.remove_rating',
          target_type: 'provider_rating',
          target_id: input.id,
          meta: { confirm: input.confirm },
        },
        async () => {
          if (!input.confirm.trim()) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'נדרש אישור להסרת הדירוג' })
          }
          try {
            const label = await getRatingLabel(ctx.db, input.id)
            const deleted = await removeRating(ctx.db, input.id)
            if (!deleted) {
              throw new TRPCError({ code: 'NOT_FOUND', message: 'הדירוג לא נמצא' })
            }
            return { ...deleted, label }
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  // ── CALENDAR / MEETINGS (read-only) ──────────────────────────────────────────
  calendarEvents: requireLevel('admin.super')
    .input(GodCalendarListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listCalendarEvents(ctx.db, input)
      } catch (e) {
        rethrow(e)
      }
    }),
})
