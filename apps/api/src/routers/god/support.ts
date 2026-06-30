import { TRPCError } from '@trpc/server'
import { router, requireLevel } from '../../trpc.js'
import { godMutation } from '../../lib/god.js'
import {
  GodSupportThreadInput,
  GodSupportSendInput,
  type GodSupportThread,
} from '@asset-rise/shared'
import { getThread, sendAdminMessage } from '../../repos/godSupport.repo.js'

// god.support — the admin↔user two-way system chat. Read gated on admin.super;
// the send write goes through godMutation (audited).
export const godSupportRouter = router({
  thread: requireLevel('admin.super')
    .input(GodSupportThreadInput)
    .query(async ({ ctx, input }): Promise<GodSupportThread> => {
      try {
        return await getThread(ctx.db, input.user_id)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
    }),

  send: requireLevel('admin.super')
    .input(GodSupportSendInput)
    .mutation(({ ctx, input }) =>
      godMutation(
        ctx,
        {
          action: 'god.support.send',
          target_type: 'support_thread',
          target_id: input.user_id,
          meta: { template: input.template_id ?? null, len: input.body.length },
        },
        () => sendAdminMessage(ctx.db, ctx.user!.id, input.user_id, input.body),
      ),
    ),
})
