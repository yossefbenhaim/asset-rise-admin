import { randomUUID } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import {
  GodBroadcastPreviewInput,
  GodBroadcastSendInput,
  GodBroadcastRecentInput,
  GodBroadcastResendInput,
} from '@asset-rise/shared'
import { router, requireLevel } from '../../trpc.js'
import { godProcedure, godMutation, logGod } from '../../lib/god.js'
import {
  listBroadcastBuildings,
  previewBroadcast,
  sendBroadcast,
  listRecentBroadcasts,
  PG_FK_VIOLATION,
} from '../../repos/godNotifications.repo.js'

// God-mode "System Broadcast" router (Wave 3 — content + comms). THE MARQUEE
// FEATURE. READS gate on requireLevel('admin.super') (direct roleKey membership,
// the same pattern as routers/god/_index.ts). WRITES go through godProcedure +
// godMutation so every attempt/outcome is audited around the service-role write
// (the airtight pattern from lib/god.ts). This is an ISOLATED sibling router —
// the integration step merges it into the god router. It does NOT touch
// _root.ts / _index.ts.
//
// A broadcast inserts a 'system.announcement' notification row per recipient
// (silver-castle sc_notifications; kind has no db CHECK since migration 051).
// It can reach EVERY user in the system — the highest blast-radius write in
// god-mode — so:
//   - the recipient COUNT is previewed first (broadcast.preview), and
//   - send/resend ENFORCE (server-side, inside the write fn) that the typed
//     `confirm` token equals expected_count — the UI's DangerConfirm makes the
//     operator type the previewed count; the guard runs inside godMutation so a
//     rejected/probing attempt is still audited, and a scripted call with a
//     bogus confirm is rejected (not just a UI nicety), and
//   - the ACTUAL server-resolved recipient count is written to the immutable
//     audit (a dedicated `phase:'sent'` logGod row) — not just the client's
//     expected_count — so the true blast size is always on record.
// All rows of one send share a single event_id; the unique index on
// (event_id, recipient_id) makes a SINGLE send invocation idempotent (a
// redelivery/replay of the SAME event_id can't double-notify). NOTE: each
// send/resend mints a FRESH event_id, so retrying a partially-failed send (or
// resending) WILL re-notify recipients who already got the prior attempt —
// idempotency is per-invocation, not cross-retry.

// PostgREST/Postgres "undefined column" codes — 42703 is the raw Postgres
// SQLSTATE, PGRST204 the PostgREST schema-cache miss. Either means a write
// referenced a column the table doesn't have (schema drift). We translate it to
// a Hebrew BAD_REQUEST instead of letting it fall through to a raw 500.
const PG_UNDEFINED_COLUMN = '42703'
const PGRST_UNDEFINED_COLUMN = 'PGRST204'

function isUndefinedColumn(e: unknown): boolean {
  const code = (e as any)?.code
  return code === PG_UNDEFINED_COLUMN || code === PGRST_UNDEFINED_COLUMN
}
function isFkViolation(e: unknown): boolean {
  return (e as any)?.code === PG_FK_VIOLATION
}

// Re-throw a repo error as a Hebrew TRPCError. Domain sentinels → friendly
// messages, an undefined-column / schema-drift error → 400, an FK violation →
// 400 (never a raw 500), anything else → 500 with the underlying message.
function rethrow(e: unknown): never {
  if (e instanceof TRPCError) throw e
  if (e instanceof Error && e.message === 'BUILDING_NOT_FOUND') {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'הבניין לא נמצא' })
  }
  if (e instanceof Error && e.message === 'NO_RECIPIENTS') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'אין נמענים בקהל היעד שנבחר — אין למי לשלוח',
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
      message: 'הפעולה הפרה אילוץ במסד הנתונים',
    })
  }
  const message = e instanceof Error ? e.message : 'שגיאה בלתי צפויה'
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
}

export const godNotificationsRouter = router({
  // ── Reads ──────────────────────────────────────────────────────────────────
  // buildings — buildings with tenants (+ tenant count) for the "one building"
  // audience selector.
  buildings: requireLevel('admin.super').query(async ({ ctx }) => {
    try {
      return await listBroadcastBuildings(ctx.db)
    } catch (e) {
      rethrow(e)
    }
  }),

  // preview — resolve an audience to a recipient COUNT (+ label + sample)
  // WITHOUT sending. The UI shows this blast radius and makes the operator type
  // the count into the DangerConfirm before send. A READ (no godMutation) — it
  // mutates nothing — but still super-admin gated.
  preview: requireLevel('admin.super')
    .input(GodBroadcastPreviewInput)
    .query(async ({ ctx, input }) => {
      try {
        return await previewBroadcast(ctx.db, input.audience)
      } catch (e) {
        rethrow(e)
      }
    }),

  // recent — recent 'system.announcement' sends, one summary row per event_id,
  // newest first, for review + resend.
  recent: requireLevel('admin.super')
    .input(GodBroadcastRecentInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listRecentBroadcasts(ctx.db, input.limit)
      } catch (e) {
        rethrow(e)
      }
    }),

  // ── Writes (all audited via godMutation) ─────────────────────────────────────
  // send — THE broadcast. Inserts a 'system.announcement' row per resolved
  // recipient (chunked, idempotent on event_id). HIGHEST blast radius in the
  // system, so the UI gates it behind a DangerConfirm whose token is the
  // previewed recipient count; the non-empty `confirm` guard runs INSIDE the
  // write fn so a rejected/probing attempt is also audited. A FRESH event_id per
  // send avoids collision with prior sends' rows.
  send: godProcedure.input(GodBroadcastSendInput).mutation(({ ctx, input }) => {
    const event_id = randomUUID()
    return godMutation(
      ctx,
      {
        action: 'god.broadcast.send',
        target_type: 'notification_broadcast',
        target_id: event_id,
        meta: {
          event_id,
          audience: input.audience.type,
          building_id: input.audience.type === 'building' ? input.audience.building_id : null,
          role: input.audience.type === 'role' ? input.audience.role : null,
          title: input.title,
          expected_count: input.expected_count,
          confirm: input.confirm,
        },
      },
      async () => {
        if (input.confirm.trim() !== String(input.expected_count)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'האישור אינו תואם את מספר הנמענים שהוצג — יש להקליד את המספר המדויק',
          })
        }
        try {
          const result = await sendBroadcast(ctx.db, {
            event_id,
            audience: input.audience,
            title: input.title,
            body: input.body ?? null,
            link: input.link ?? null,
            actor_id: ctx.user?.id ?? null,
          })
          // Record the ACTUAL server-resolved blast size in the immutable audit;
          // godMutation's ok-leg carries only the client-supplied expected_count.
          await logGod(ctx, {
            action: 'god.broadcast.send',
            target_type: 'notification_broadcast',
            target_id: event_id,
            meta: {
              event_id,
              phase: 'sent',
              sent: result.sent,
              expected: result.expected,
              audience_label: result.audience_label,
            },
          })
          return result
        } catch (e) {
          rethrow(e)
        }
      },
    )
  }),

  // resend — re-broadcast a prior send. Re-resolves the (re-confirmed) audience
  // and inserts a fresh batch with a NEW event_id (so it can't collide with the
  // original send's (event_id, recipient_id) rows). Same blast radius as send →
  // same DangerConfirm + non-empty confirm guard inside the write fn. The
  // original event_id is recorded in the audit meta for linkage.
  resend: godProcedure.input(GodBroadcastResendInput).mutation(({ ctx, input }) => {
    const event_id = randomUUID()
    return godMutation(
      ctx,
      {
        action: 'god.broadcast.resend',
        target_type: 'notification_broadcast',
        target_id: event_id,
        meta: {
          event_id,
          source_event_id: input.source_event_id,
          audience: input.audience.type,
          building_id: input.audience.type === 'building' ? input.audience.building_id : null,
          role: input.audience.type === 'role' ? input.audience.role : null,
          title: input.title,
          expected_count: input.expected_count,
          confirm: input.confirm,
        },
      },
      async () => {
        if (input.confirm.trim() !== String(input.expected_count)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'האישור אינו תואם את מספר הנמענים שהוצג — יש להקליד את המספר המדויק',
          })
        }
        try {
          const result = await sendBroadcast(ctx.db, {
            event_id,
            audience: input.audience,
            title: input.title,
            body: input.body ?? null,
            link: input.link ?? null,
            actor_id: ctx.user?.id ?? null,
          })
          await logGod(ctx, {
            action: 'god.broadcast.resend',
            target_type: 'notification_broadcast',
            target_id: event_id,
            meta: {
              event_id,
              source_event_id: input.source_event_id,
              phase: 'sent',
              sent: result.sent,
              expected: result.expected,
              audience_label: result.audience_label,
            },
          })
          return result
        } catch (e) {
          rethrow(e)
        }
      },
    )
  }),
})
