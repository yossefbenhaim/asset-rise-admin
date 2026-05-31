import { z } from 'zod'

// ── God-mode: Chat Moderation (Wave 3 — content + comms) ─────────────────────
// Zod inputs + response shapes for the super-admin chat-moderation domain.
// Backend gating is requireLevel('admin.super') (direct roleKey membership);
// these schemas only validate payloads. Isolated from the other god schema files
// on purpose — the integration step re-exports this from
// packages/shared/src/index.ts.
//
// Domain model (silver-castle sc_*, confirmed against
// db/migrations/003_building_group_chat.sql + 046_chat_message_actions.sql):
//   sc_chat_threads(id, building_id [UNIQUE], kind, created_at)
//     — exactly one thread per building.
//   sc_chat_messages(id, thread_id → sc_chat_threads, sender_id → sc_profiles
//     [nullable; null = system], body, meta jsonb, created_at,
//     reply_to_id, edited_at, deleted_at, acted_by_user_id)
//     — there is NO building_id on the message; it is reached via
//       thread_id → sc_chat_threads.building_id.
//     — SOFT-DELETE column is `deleted_at` (timestamptz). When set, the main
//       app renders the message as "הודעה נמחקה" but the body is preserved.
//       Moderation = set deleted_at (delete) / null it (restore); we NEVER hard
//       delete the row.

// ── Building picker (read) ───────────────────────────────────────────────────
// A lightweight list of buildings that have a chat thread, with a message count,
// so the moderator can pick a room. Self-contained in the chat router so the
// page does not depend on god.buildings being wired.
export interface GodChatBuilding {
  building_id: string
  thread_id: string
  address: string | null
  city: string | null
  message_count: number
  deleted_count: number
}

// ── Thread (read) ────────────────────────────────────────────────────────────
// The full message thread for one building, including soft-deleted rows (so the
// moderator can see + restore them). Sender names are resolved server-side.
export const GodChatThreadInput = z.object({
  building_id: z.string().uuid(),
  // When false (default) soft-deleted messages are still returned but flagged
  // is_deleted=true so the UI can render + offer restore. There is no "hide
  // deleted" server filter — moderation needs to see everything.
  limit: z.number().int().min(1).max(2000).default(1000),
})
export type GodChatThreadInput = z.infer<typeof GodChatThreadInput>

export interface GodChatMessage {
  id: string
  sender_id: string | null
  // Resolved display name; null sender_id = system message.
  sender_name: string | null
  sender_email: string | null
  // The family-member operator (sc_chat_messages.acted_by_user_id), when the
  // message was sent "on behalf of" the primary account holder.
  acted_by_name: string | null
  body: string | null
  created_at: string | null
  edited_at: string | null
  // deleted_at is the soft-delete marker; is_deleted is the convenience boolean.
  deleted_at: string | null
  is_deleted: boolean
  reply_to_id: string | null
}

export interface GodChatThread {
  building_id: string
  thread_id: string | null
  address: string | null
  city: string | null
  message_count: number
  deleted_count: number
  messages: GodChatMessage[]
}

// ── Writes ────────────────────────────────────────────────────────────────────
// deleteMessage — SOFT delete: set sc_chat_messages.deleted_at = now(). The body
// is preserved; the main app renders the row as "הודעה נמחקה". DESTRUCTIVE from
// the tenants' point of view (the message disappears for everyone), so the UI
// gates it behind a DangerConfirm. `confirm` carries the typed token from that
// interlock; the backend treats it only as a non-empty guard.
export const GodChatDeleteMessageInput = z.object({
  id: z.string().uuid(),
  confirm: z.string().min(1).max(400),
})
export type GodChatDeleteMessageInput = z.infer<typeof GodChatDeleteMessageInput>

// restoreMessage — un-soft-delete: set sc_chat_messages.deleted_at = null. Not
// destructive (it re-exposes a previously hidden message), so no DangerConfirm —
// but still a god write, so still audited.
export const GodChatRestoreMessageInput = z.object({
  id: z.string().uuid(),
})
export type GodChatRestoreMessageInput = z.infer<typeof GodChatRestoreMessageInput>
