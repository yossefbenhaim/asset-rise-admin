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
// Delivery pipeline: every task passes dev → QA (Hawkeye) → security (Shield)
// before it may be marked deployed. 'review' kept for backward-compat rows.
const STATUSES = [
  'backlog',
  'spec',
  'in_dev',
  'qa',
  'security',
  'review', // waiting for Yossef's live check on the staging preview
  'approved', // Yossef approved — the factory merges to main + deploys
  'deployed',
  'blocked',
  'waiting_yossef',
] as const

const SELECT =
  'id,seq,title,description,context,branch,work_log,preview_url,phase,task_type,agent,status,blocked_reason,notes,depends_on,priority,system_area,user_persona,acceptance_criteria,do_not_break,size,reference_links,token_rounds,total_tokens,created_at,updated_at'

export interface TokenRound {
  round: number
  agent: string
  stage: string
  in: number
  out: number
  tokens: number
  cost_usd: number
  at: string
}

export interface DevTask {
  id: string
  seq: number
  title: string
  description: string | null
  context: string | null
  branch: string | null
  work_log: string | null
  preview_url: string | null
  phase: string
  task_type: string
  agent: string
  status: string
  blocked_reason: string | null
  notes: string | null
  depends_on: number[]
  priority: number
  system_area: string | null
  user_persona: string | null
  acceptance_criteria: string | null
  do_not_break: string | null
  size: string | null
  reference_links: string | null
  token_rounds: TokenRound[]
  total_tokens: number
  created_at: string
  updated_at: string
}

export interface DevTaskQuestion {
  id: string
  task_id: string
  asked_by: string
  question: string
  answer: string | null
  status: string
  asked_at: string
  answered_at: string | null
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
    const { count: openQ } = await ctx.db
      .from('sc_dev_task_questions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
    return {
      total: rows.length,
      working: count('spec', 'in_dev', 'qa', 'security', 'review'),
      deployed: count('deployed'),
      waiting: count('blocked', 'waiting_yossef'),
      openQuestions: openQ ?? 0,
    }
  }),

  // All questions across the board — the web joins them to cards client-side.
  questions: requireAction('admin.devtasks.view').query(async ({ ctx }) => {
    const { data, error } = await ctx.db
      .from('sc_dev_task_questions')
      .select('id,task_id,asked_by,question,answer,status,asked_at,answered_at')
      .order('asked_at', { ascending: false })
      .limit(500)
    if (error) throw error
    return (data ?? []) as unknown as DevTaskQuestion[]
  }),

  // Yossef answers an agent's question — the factory worker resumes the task
  // on its next tick with the answer injected into the agent's context.
  answerQuestion: requireAction('admin.devtasks.manage')
    .input(z.object({ id: z.string().uuid(), answer: z.string().trim().min(1).max(4000) }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.db
        .from('sc_dev_task_questions')
        .update({ answer: input.answer, status: 'answered', answered_at: new Date().toISOString() })
        .eq('id', input.id)
      if (error) throw error
      return { ok: true }
    }),

  create: requireAction('admin.devtasks.manage')
    .input(
      z.object({
        // Required so every card is testable: what it is, where it lives, and
        // which user/role to log in as to check it.
        title: z.string().trim().min(2).max(160),
        description: z.string().trim().min(10).max(4000),
        system_area: z.string().trim().min(2).max(300),
        user_persona: z.string().trim().min(2).max(120),
        phase: z.enum(PHASES).default('quickwin'),
        task_type: z.enum(TYPES).default('dev'),
        agent: z.string().trim().min(2).max(60).default('Claude'),
        status: z.enum(STATUSES).default('backlog'),
        depends_on: z.array(z.number().int().nonnegative()).max(20).optional(),
        priority: z.number().int().min(0).max(2).default(2),
        acceptance_criteria: z.string().max(3000).optional(),
        do_not_break: z.string().max(2000).optional(),
        size: z.enum(['S', 'M', 'L']).optional(),
        reference_links: z.string().max(1500).optional(),
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
          description: z.string().max(4000).nullable().optional(),
          context: z.string().max(8000).nullable().optional(),
          phase: z.enum(PHASES).optional(),
          task_type: z.enum(TYPES).optional(),
          agent: z.string().trim().min(2).max(60).optional(),
          status: z.enum(STATUSES).optional(),
          blocked_reason: z.string().max(400).nullable().optional(),
          notes: z.string().max(4000).nullable().optional(),
          depends_on: z.array(z.number().int().nonnegative()).max(20).nullable().optional(),
          priority: z.number().int().min(0).max(2).optional(),
          system_area: z.string().max(300).nullable().optional(),
          user_persona: z.string().max(120).nullable().optional(),
          acceptance_criteria: z.string().max(3000).nullable().optional(),
          do_not_break: z.string().max(2000).nullable().optional(),
          size: z.enum(['S', 'M', 'L']).nullable().optional(),
          reference_links: z.string().max(1500).nullable().optional(),
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
