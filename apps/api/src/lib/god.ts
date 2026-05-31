// god.ts — the god-mode write framework.
//
// godProcedure is the gated base for every god WRITE. It is NOT a parallel
// auth path: it is exactly requireLevel('admin.super') (direct membership of
// the 'admin.super' roleKey, which only the super-admin session carries).
//
// logGod() is the low-level audit sugar — it reuses the existing audit()
// (which never throws, so a logging failure can never roll back the mutation).
// The `action` is a `god.${string}` template literal so a caller cannot forget
// the namespace.
//
// godMutation() is the AIRTIGHT wrapper every god write MUST go through. It
// logs the attempt BEFORE the write, then logs the outcome (ok | error) AFTER.
// This is the whole point: a god write that throws after mutating some rows
// (multi-statement / multi-table writes in later waves) would, under the bare
// "write-then-logGod" pattern, leave ZERO audit trail because control never
// reaches the log. Logging around the write — not only on success — means the
// most dangerous surface in the system can never perform a partial destructive
// action invisibly. Both log legs are safe because audit() never throws.
//
// The airtight pattern for a god write:
//   godProcedure
//     .input(...)
//     .mutation(({ ctx, input }) =>
//       godMutation(ctx, {
//         action: 'god.x.y',
//         target_type: '...',
//         target_id: input.id,
//         meta: { ... },                 // recorded on attempt + ok + error
//       }, () => repoWrite(ctx.db, input)),   // service-role write
//     )
// gate (admin.super) + DB-immutable audit (migration 007 trigger) +
// service-role write (adminClient) + attempt/outcome trail (godMutation).
//
// DO NOT use the bare `const row = await repoWrite(...); await logGod(...)`
// pattern for destructive writes — it cannot record a failed/partial attempt.

import type { AppContext } from '../context.js'
import { requireLevel } from '../trpc.js'
import { audit } from './audit.js'

// The single gated base procedure for god endpoints (reads AND writes).
// BOTH use requireLevel('admin.super') — DIRECT roleKey membership, never
// requireAction — so the gate can never be loosened by a stray sc_permissions
// seed. The 'god.*' actions exist solely for the frontend nav can() mirror.
export const godProcedure = requireLevel('admin.super')

type GodLogArgs = {
  action: `god.${string}`
  target_type?: string | null
  target_id?: string | null
  meta?: Record<string, unknown> | null
}

export async function logGod(ctx: AppContext, args: GodLogArgs): Promise<void> {
  await audit(ctx.db, {
    // Under godProcedure (extends protectedProcedure) ctx.user is always set,
    // so god actions are always attributable.
    actor_id: ctx.user?.id ?? null,
    action: args.action,
    target_type: args.target_type ?? null,
    target_id: args.target_id ?? null,
    meta: args.meta ?? null,
    ip: ctx.ip,
  })
}

// godMutation — the airtight wrapper. Logs an `attempt` BEFORE the write, runs
// the write, then logs `ok` (with the elapsed ms) or `error` (with the message)
// AFTER. The error is re-thrown so tRPC still surfaces the failure to the
// caller; only the audit trail is forced to exist on BOTH legs.
//
// Each log carries phase + the caller-supplied meta, so attempt/ok/error rows
// for one action are correlatable in the Audit Log Viewer.
export async function godMutation<T>(
  ctx: AppContext,
  args: GodLogArgs,
  write: () => Promise<T>,
): Promise<T> {
  const baseMeta = args.meta ?? {}
  await logGod(ctx, { ...args, meta: { ...baseMeta, phase: 'attempt' } })
  const startedAt = Date.now()
  try {
    const row = await write()
    await logGod(ctx, {
      ...args,
      meta: { ...baseMeta, phase: 'ok', ms: Date.now() - startedAt },
    })
    return row
  } catch (e) {
    await logGod(ctx, {
      ...args,
      meta: {
        ...baseMeta,
        phase: 'error',
        ms: Date.now() - startedAt,
        error: e instanceof Error ? e.message : String(e),
      },
    })
    throw e
  }
}
