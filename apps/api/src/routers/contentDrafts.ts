// Parker's content drafts — review queue for articles/pages before publish.
// The host loop inserts drafts (payload = full Article object + hero image
// base64); Yossef previews them visually in the admin and approves/rejects.
// Approval here is the human gate — the merge+deploy still runs on the host.
import { z } from 'zod'
import { router, requireAction } from '../trpc.js'
import { audit } from '../lib/audit.js'

export const contentDraftsRouter = router({
  list: requireAction('admin.agents.view').query(async ({ ctx }) => {
    const { data, error } = await ctx.db
      .from('sc_content_drafts')
      .select('id, kind, slug, title, branch, status, submitted_by, note, created_at, decided_at')
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw new Error(error.message)
    return { drafts: data ?? [] }
  }),

  detail: requireAction('admin.agents.view')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from('sc_content_drafts')
        .select('*')
        .eq('id', input.id)
        .single()
      if (error) throw new Error(error.message)
      return { draft: data }
    }),

  decide: requireAction('admin.agents.view')
    .input(z.object({ id: z.string().uuid(), decision: z.enum(['approved', 'rejected']) }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from('sc_content_drafts')
        .update({
          status: input.decision,
          decided_at: new Date().toISOString(),
          decided_by: ctx.user?.email ?? 'admin',
        })
        .eq('id', input.id)
        .eq('status', 'pending')
        .select('id, slug, title, branch')
        .single()
      if (error) throw new Error(error.message)
      await audit(ctx.db, {
        actor_id: ctx.user?.id ?? null,
        action: `content_draft.${input.decision}`,
        target_type: 'content_draft',
        target_id: input.id,
        meta: { slug: data.slug, branch: data.branch },
      })
      return { ok: true, draft: data }
    }),
})
