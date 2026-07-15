// Dev Tasks board (מרכז פיתוח) — the Redirectx gap-closing campaign as a
// managed board: ordered tasks, each with a campaign phase, an owning agent
// and a delivery status. Seeded by migration 031; managed from the admin.
import { z } from 'zod'
import { router, requireAction } from '../trpc.js'

const PHASES = [
  'ops',
  'regulation',
  'organizer',
  'comms',
  'payments',
  'collab',
  'quickwin',
] as const
const TYPES = ['dev', 'dev_external', 'human'] as const
const STATUSES = [
  'backlog',
  'spec',
  'in_dev',
  'review',
  'deployed',
  'blocked',
  'waiting_yossef',
] as const

const SELECT =
  'id,seq,title,description,phase,task_type,agent,status,blocked_reason,notes,depends_on,created_at,updated_at'

export interface DevTask {
  id: string
  seq: number
  title: string
  description: string | null
  phase: string
  task_type: string
  agent: string
  status: string
  blocked_reason: string | null
  notes: string | null
  depends_on: number[]
  created_at: string
  updated_at: string
}

export const devTasksRouter = router({
  list: requireAction('admin.devtasks.view')
    .input(
      z
        .object({
          status: z.enum(STATUSES).optional(),
          phase: z.enum(PHASES).optional(),
          agent: z.string().max(60).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      let q = ctx.db.from('sc_dev_tasks').select(SELECT).order('seq')
      if (input?.status) q = q.eq('status', input.status)
      if (input?.phase) q = q.eq('phase', input.phase)
      if (input?.agent) q = q.eq('agent', input.agent)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as DevTask[]
    }),

  stats: requireAction('admin.devtasks.view').query(async ({ ctx }) => {
    const { data, error } = await ctx.db.from('sc_dev_tasks').select('status')
    if (error) throw error
    const rows = (data ?? []) as { status: string }[]
    const count = (...s: string[]) => rows.filter(r => s.includes(r.status)).length
    return {
      total: rows.length,
      working: count('spec', 'in_dev', 'review'),
      deployed: count('deployed'),
      waiting: count('blocked', 'waiting_yossef'),
    }
  }),

  create: requireAction('admin.devtasks.manage')
    .input(
      z.object({
        title: z.string().trim().min(2).max(160),
        description: z.string().max(2000).optional(),
        phase: z.enum(PHASES).default('quickwin'),
        task_type: z.enum(TYPES).default('dev'),
        agent: z.string().trim().min(2).max(60).default('Claude'),
        status: z.enum(STATUSES).default('backlog'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data: maxRow } = await ctx.db
        .from('sc_dev_tasks')
        .select('seq')
        .order('seq', { ascending: false })
        .limit(1)
        .maybeSingle()
      const seq = ((maxRow as { seq: number } | null)?.seq ?? -1) + 1
      const { data, error } = await ctx.db
        .from('sc_dev_tasks')
        .insert({ ...input, seq })
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as DevTask
    }),

  update: requireAction('admin.devtasks.manage')
    .input(
      z.object({
        id: z.string().uuid(),
        patch: z.object({
          title: z.string().trim().min(2).max(160).optional(),
          description: z.string().max(2000).nullable().optional(),
          phase: z.enum(PHASES).optional(),
          task_type: z.enum(TYPES).optional(),
          agent: z.string().trim().min(2).max(60).optional(),
          status: z.enum(STATUSES).optional(),
          blocked_reason: z.string().max(400).nullable().optional(),
          notes: z.string().max(4000).nullable().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from('sc_dev_tasks')
        .update({ ...input.patch, updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as DevTask
    }),

  remove: requireAction('admin.devtasks.manage')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.db.from('sc_dev_tasks').delete().eq('id', input.id)
      if (error) throw error
      return { ok: true }
    }),
})
