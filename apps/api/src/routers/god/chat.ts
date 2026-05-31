import { TRPCError } from '@trpc/server'
import {
  GodChatThreadInput,
  GodChatDeleteMessageInput,
  GodChatRestoreMessageInput,
} from '@asset-rise/shared/schemas/godChat'
import { router, requireLevel } from '../../trpc.js'
import { godProcedure, godMutation } from '../../lib/god.js'
import {
  listChatBuildings,
  getChatThread,
  softDeleteMessage,
  restoreMessage,
  PG_FK_VIOLATION,
} from '../../repos/godChat.repo.js'

// God-mode "Chat Moderation" router (Wave 3 — content + comms). READS gate on
// requireLevel('admin.super') (direct roleKey membership, the same pattern as
// routers/god/_index.ts). WRITES go through godProcedure + godMutation so every
// attempt/outcome is audited around the service-role write (the airtight pattern
// from lib/god.ts). This is an ISOLATED sibling router — the integration step
// merges it into the god router. It does NOT touch _root.ts / _index.ts.
//
// Moderation is purely a flip of sc_chat_messages.deleted_at (confirmed against
// silver-castle db/migrations/046_chat_message_actions.sql):
//   deleteMessage  — SOFT delete: set deleted_at = now() (body preserved; the
//                    main app renders "הודעה נמחקה"). DangerConfirm in the UI.
//   restoreMessage — un-soft-delete: set deleted_at = null.
// We NEVER hard-delete a chat row.

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

function notFound(): never {
  throw new TRPCError({ code: 'NOT_FOUND', message: 'ההודעה לא נמצאה' })
}

// Re-throw a repo error as a Hebrew TRPCError. NOT_FOUND sentinel → 404, an
// undefined-column / schema-drift error → 400, an FK violation → 400 (never a
// raw 500), anything else → 500 with the underlying message.
function rethrow(e: unknown): never {
  if (e instanceof TRPCError) throw e
  if (e instanceof Error && e.message === 'NOT_FOUND') notFound()
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

export const godChatRouter = router({
  // ── Reads ──────────────────────────────────────────────────────────────────
  // buildings — every building that has a chat thread (+ message / deleted
  // counts) to pick a room to moderate.
  buildings: requireLevel('admin.super').query(async ({ ctx }) => {
    try {
      return await listChatBuildings(ctx.db)
    } catch (e) {
      rethrow(e)
    }
  }),

  // thread — the full message thread for one building, INCLUDING soft-deleted
  // rows (flagged is_deleted) so the moderator can see + restore them.
  thread: requireLevel('admin.super')
    .input(GodChatThreadInput)
    .query(async ({ ctx, input }) => {
      try {
        return await getChatThread(ctx.db, input)
      } catch (e) {
        rethrow(e)
      }
    }),

  // ── Writes (all audited via godMutation) ─────────────────────────────────────
  // deleteMessage — SOFT delete (set deleted_at = now()). DESTRUCTIVE for the
  // tenants (the message disappears for everyone), so the UI gates it behind a
  // DangerConfirm; the non-empty `confirm` token guard runs INSIDE the write fn
  // so a rejected/probing attempt is also audited.
  deleteMessage: godProcedure
    .input(GodChatDeleteMessageInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.chat.delete_message',
          target_type: 'chat_message',
          target_id: input.id,
          meta: { soft: true, confirm: input.confirm },
        },
        async () => {
          if (!input.confirm.trim()) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'נדרש אישור למחיקת ההודעה' })
          }
          try {
            return await softDeleteMessage(ctx.db, input.id)
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),

  // restoreMessage — un-soft-delete (set deleted_at = null). Not destructive (it
  // re-exposes a hidden message), so no DangerConfirm — but still audited.
  restoreMessage: godProcedure
    .input(GodChatRestoreMessageInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.chat.restore_message',
          target_type: 'chat_message',
          target_id: input.id,
          meta: { soft: true },
        },
        async () => {
          try {
            return await restoreMessage(ctx.db, input.id)
          } catch (e) {
            rethrow(e)
          }
        },
      ),
    ),
})
