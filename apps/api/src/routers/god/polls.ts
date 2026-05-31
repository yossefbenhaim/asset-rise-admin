import { TRPCError } from '@trpc/server'
import {
  GodPollListInput,
  GodPollGetInput,
  GodCreatePollInput,
  GodForceFinalizePollInput,
  GodReopenPollInput,
  GodOverrideResultInput,
} from '@asset-rise/shared/schemas/godPolls'
import { router, requireLevel } from '../../trpc.js'
import { godProcedure, godMutation } from '../../lib/god.js'
import {
  listPolls,
  getPollDetail,
  getPollConfirmRow,
  listBuildingOptions,
  createPoll,
  forceFinalizePoll,
  reopenPoll,
  overrideResult,
  PollPreconditionError,
  PG_FK_VIOLATION,
  PG_CHECK_VIOLATION,
} from '../../repos/godPolls.repo.js'

// God-mode "Polls / Elections" router (Wave 2 — Workflow). READS gate on
// requireLevel('admin.super') (direct roleKey membership, the same pattern as
// routers/god/_index.ts). WRITES go through godProcedure + godMutation so every
// attempt/outcome is audited around the service-role write (the airtight
// pattern from lib/god.ts). Preconditions/interlocks run INSIDE the write fn so
// a rejected/probing attempt is still audited.
//
// This is an ISOLATED sibling router — the integration step merges it into the
// god router (god.polls). It does NOT touch _root.ts / _index.ts.
//
// forceFinalize / overrideResult / reopen DELIBERATELY BYPASS the normal poll
// flow (the silver-castle chair/finalize logic computes the winner from the
// tally + threshold). They set status / result_user_id directly via
// service-role with NO tally/threshold check. overrideResult is surfaced behind
// a DangerConfirm in the UI and fully audited.

function notFound(): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'ההצבעה לא נמצאה' })
}

// Re-throw a repo error as a Hebrew TRPCError. NOT_FOUND sentinel → 404,
// PollPreconditionError → 400, FK/CHECK violation → clear Hebrew, anything else
// → 500 with the underlying message.
function rethrow(e: unknown): never {
  if (e instanceof TRPCError) throw e
  if (e instanceof PollPreconditionError) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: e.message })
  }
  if (e instanceof Error && e.message === 'NOT_FOUND') notFound()
  const code = (e as any)?.code
  if (code === PG_FK_VIOLATION) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message:
        'הפעולה נחסמה — הבניין או המשתמש שנבחרו אינם קיימים במערכת (מפתח זר).',
    })
  }
  if (code === PG_CHECK_VIOLATION) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'ערך לא חוקי (סוג / סטטוס / אחוז סף מחוץ לטווח המותר).',
    })
  }
  const message = e instanceof Error ? e.message : 'שגיאה בלתי צפויה'
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
}

// Re-verify a typed confirmation token against the live poll question before a
// result-overriding write. Runs INSIDE the godMutation write fn so a
// wrong/stale token is audited as a failed attempt.
async function assertConfirmMatches(
  db: Parameters<typeof getPollConfirmRow>[0],
  id: string,
  confirm: string,
): Promise<void> {
  const live = await getPollConfirmRow(db, id)
  if (!live) notFound()
  const expected = (live.question ?? '').trim()
  if (!expected || confirm.trim() !== expected) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'השאלה שהוקלדה אינה תואמת את שאלת ההצבעה',
    })
  }
}

export const godPollsRouter = router({
  // ── Reads ──────────────────────────────────────────────────────────────────
  list: requireLevel('admin.super')
    .input(GodPollListInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listPolls(ctx.db, input)
      } catch (e) {
        rethrow(e)
      }
    }),

  get: requireLevel('admin.super')
    .input(GodPollGetInput)
    .query(async ({ ctx, input }) => {
      try {
        const detail = await getPollDetail(ctx.db, input.id)
        if (!detail) notFound()
        return detail
      } catch (e) {
        rethrow(e)
      }
    }),

  // Building options for the createPoll building picker.
  buildingOptions: requireLevel('admin.super').query(async ({ ctx }) => {
    try {
      return await listBuildingOptions(ctx.db)
    } catch (e) {
      rethrow(e)
    }
  }),

  // ── Writes (all audited via godMutation) ─────────────────────────────────────
  // createPoll — author a new poll (+ options) on a building, always 'open'.
  createPoll: godProcedure
    .input(GodCreatePollInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.polls.create',
          target_type: 'building',
          target_id: input.building_id,
          meta: {
            kind: input.kind,
            question: input.question,
            threshold_pct: input.threshold_pct,
            option_count: input.options?.length ?? 0,
          },
        },
        async () => {
          try {
            return await createPoll(ctx.db, input, ctx.user?.id ?? null)
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  // forceFinalize — set status='finalized' (pure flip; no winner computed). The
  // no-op interlock runs inside the repo write fn so a rejected attempt is audited.
  forceFinalize: godProcedure
    .input(GodForceFinalizePollInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.polls.force_finalize',
          target_type: 'poll',
          target_id: input.id,
          meta: { bypass: 'tally_threshold' },
        },
        async () => {
          try {
            return await forceFinalizePoll(ctx.db, input.id)
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  // reopen — set status='open'. The no-op interlock runs inside the repo.
  reopen: godProcedure
    .input(GodReopenPollInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.polls.reopen',
          target_type: 'poll',
          target_id: input.id,
          meta: {},
        },
        async () => {
          try {
            return await reopenPoll(ctx.db, input.id)
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  // overrideResult — VERY dangerous result-override. DangerConfirm types the
  // poll question; the backend re-verifies it before mutating. BYPASSES the
  // tally + threshold entirely.
  overrideResult: godProcedure
    .input(GodOverrideResultInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.polls.override_result',
          target_type: 'poll',
          target_id: input.id,
          meta: {
            set_result: input.set_result,
            result_user_id: input.set_result ? input.result_user_id ?? null : undefined,
            status: input.status,
            confirm: input.confirm,
            bypass: 'tally_threshold',
          },
        },
        async () => {
          await assertConfirmMatches(ctx.db, input.id, input.confirm)
          try {
            return await overrideResult(ctx.db, {
              id: input.id,
              setResult: input.set_result,
              resultUserId: input.result_user_id ?? null,
              status: input.status,
            })
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),
})
