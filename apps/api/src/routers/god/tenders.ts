import { TRPCError } from '@trpc/server'
import {
  GodTenderListInput,
  GodTenderGetInput,
  GodSetTenderStatusInput,
  GodForceAwardInput,
  GodCancelTenderInput,
} from '@asset-rise/shared'
import { router, requireLevel } from '../../trpc.js'
import { godProcedure, godMutation } from '../../lib/god.js'
import {
  listTenders,
  getTenderDetail,
  getTenderConfirmRow,
  setTenderStatus,
  forceAward,
  cancelTender,
  TenderPreconditionError,
  PG_FK_VIOLATION,
} from '../../repos/godTenders.repo.js'

// God-mode "Tenders + Bids" router (Wave 2 — Deals). READS gate on
// requireLevel('admin.super') (direct roleKey membership, the same pattern as
// routers/god/_index.ts). WRITES go through godProcedure + godMutation so every
// attempt/outcome is audited around the service-role write (the airtight
// pattern from lib/god.ts). Preconditions/interlocks run INSIDE the write fn so
// a rejected/probing attempt is still audited.
//
// This is an ISOLATED sibling router — the integration step merges it into the
// god router (god.tenders). It does NOT touch _root.ts / _index.ts.
//
// forceAward DELIBERATELY BYPASSES the normal tender/poll/bid flow: it sets the
// award + bid statuses + inserts sc_project_providers directly via service-role.
// That override is surfaced behind a DangerConfirm in the UI and fully audited.

function notFound(): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'המכרז לא נמצא' })
}

// Re-throw a repo error as a Hebrew TRPCError. NOT_FOUND sentinel → 404,
// TenderPreconditionError → 400, FK violation → clear Hebrew, anything else →
// 500 with the underlying message.
function rethrow(e: unknown): never {
  if (e instanceof TRPCError) throw e
  if (e instanceof TenderPreconditionError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: e.message })
  }
  if (e instanceof Error && e.message === 'NOT_FOUND') notFound()
  if ((e as any)?.code === PG_FK_VIOLATION) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'הפעולה נחסמה עקב רשומה מקושרת (מפתח זר). יש להסיר אותה תחילה.',
    })
  }
  const message = e instanceof Error ? e.message : 'שגיאה בלתי צפויה'
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
}

// Re-verify a typed confirmation token against the live tender title before a
// destructive/result-overriding write. Runs INSIDE the godMutation write fn so
// a wrong/stale token is audited as a failed attempt.
async function assertConfirmMatches(
  db: Parameters<typeof getTenderConfirmRow>[0],
  id: string,
  confirm: string,
): Promise<void> {
  const live = await getTenderConfirmRow(db, id)
  if (!live) notFound()
  const expected = (live.title ?? '').trim()
  if (!expected || confirm.trim() !== expected) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'הכותרת שהוקלדה אינה תואמת את כותרת המכרז',
    })
  }
}

export const godTendersRouter = router({
  // ── Reads ──────────────────────────────────────────────────────────────────
  list: requireLevel('admin.super')
    .input(GodTenderListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listTenders(ctx.db, input)
      } catch (e) {
        rethrow(e)
      }
    }),

  get: requireLevel('admin.super')
    .input(GodTenderGetInput)
    .query(async ({ ctx, input }) => {
      try {
        const detail = await getTenderDetail(ctx.db, input.id)
        if (!detail) notFound()
        return detail
      } catch (e) {
        rethrow(e)
      }
    }),

  // ── Writes (all audited via godMutation) ─────────────────────────────────────
  // Plain lifecycle move (draft/open/closed/cancelled; reopen = closed→open).
  // Awarding is blocked here — use forceAward. The interlock (no-op / terminal
  // 'awarded') runs inside the repo write fn so a rejected move is audited.
  setTenderStatus: godProcedure
    .input(GodSetTenderStatusInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.tenders.set_status',
          target_type: 'tender',
          target_id: input.id,
          meta: { status: input.status },
        },
        async () => {
          try {
            return await setTenderStatus(ctx.db, input.id, input.status)
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  // Result-overriding award. DangerConfirm types the tender title; the backend
  // re-verifies it before mutating. BYPASSES the normal poll/bid flow.
  forceAward: godProcedure
    .input(GodForceAwardInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.tenders.force_award',
          target_type: 'tender',
          target_id: input.id,
          meta: { bid_id: input.bid_id, confirm: input.confirm, bypass: 'normal_bid_flow' },
        },
        async () => {
          await assertConfirmMatches(ctx.db, input.id, input.confirm)
          try {
            return await forceAward(ctx.db, input.id, input.bid_id)
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  // Force-cancel. DangerConfirm types the tender title; the backend re-verifies
  // it before cancelling.
  cancelTender: godProcedure
    .input(GodCancelTenderInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.tenders.cancel',
          target_type: 'tender',
          target_id: input.id,
          meta: { confirm: input.confirm },
        },
        async () => {
          await assertConfirmMatches(ctx.db, input.id, input.confirm)
          try {
            return await cancelTender(ctx.db, input.id)
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),
})
