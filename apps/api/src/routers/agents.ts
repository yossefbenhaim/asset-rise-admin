// Agents Center — dashboard of the whole OpenClaw agent estate. Data is pushed
// by the HOST collector (~/.openclaw/scripts/agents-center-sync.py) into
// sc_agent_* snapshot tables; this router reads those. The one WRITE surface is
// model routing (setModel): the admin picks which model an agent runs on, the
// row lands in sc_agent_model_config as 'pending', and a host applier makes it
// live. Doc/skill contents are fetched lazily via docContent/skillContent.
import { z } from 'zod'
import { router, requireAction } from '../trpc.js'

// The only models an agent may be routed to (mirrors agent-run.sh lanes).
export const AGENT_MODELS = [
  'openai-codex/gpt-5.5',
  'claude/sonnet',
  'claude/opus',
  'claude/haiku',
] as const

export interface CronOverrideRow {
  job_id: string
  job_name: string
  schedule: string | null
  enabled: boolean | null
  requested_by: string
  requested_at: string
  applied_at: string | null
  apply_status: string
  apply_error: string | null
}

export interface AgentModelConfigRow {
  agent_id: string
  desired_model: string
  status: string
  error: string | null
  requested_at: string
  applied_at: string | null
}

const REGISTRY_SELECT =
  'id,name,emoji,team,role_title,purpose,guardrails,model,fallback_model,status,version,version_why,version_history,workspace,telegram_bound,key_files,discrepancies,sessions_count,last_activity_at,synced_at'

export interface AgentRow {
  id: string
  name: string
  emoji: string | null
  team: string
  role_title: string
  purpose: string | null
  guardrails: string | null
  model: string | null
  fallback_model: string | null
  status: string
  version: string | null
  version_why: string | null
  version_history: Array<{ version: string; date: string; note: string }>
  workspace: string | null
  telegram_bound: boolean
  key_files: string[]
  discrepancies: string[]
  sessions_count: number | null
  last_activity_at: string | null
  synced_at: string
}

export interface AgentSkillRow {
  id: string
  agent_id: string
  name: string
  path: string | null
  description: string | null
  origin: string | null
  scan_verdict: string | null
  status: string
}

export interface AgentDocRow {
  id: string
  agent_id: string
  title: string
  path: string
  kind: string
  size_bytes: number | null
  modified_at: string | null
}

export interface AgentCronRow {
  id: string
  agent_id: string
  schedule: string
  description: string
  kind: string
  enabled: boolean
  last_status: string | null
}

export interface AgentActivityRow {
  id: string
  agent_id: string
  at: string
  kind: string
  title: string
  detail: string | null
  source: string | null
}

export interface LegalRequirementRow {
  id: string
  domain: string
  title: string
  why: string | null
  law: string
  section: string | null
  source_url: string | null
  severity: string
  status: string
  doc_path: string | null
  notes: string | null
  resolver: string | null
  resolver_how: string | null
  task_prompt: string | null
  sort_order: number
  synced_at: string
}

export interface LegalDomainRow {
  name: string
  icon: string | null
  summary: string | null
  applies: string | null
  tags: string[]
  sort_order: number
}

export const agentsRouter = router({
  list: requireAction('admin.agents.view').query(async ({ ctx }) => {
    const [reg, skills, docs, crons, models] = await Promise.all([
      ctx.db.from('sc_agent_registry').select(REGISTRY_SELECT).order('team').order('name'),
      ctx.db.from('sc_agent_skills').select('agent_id'),
      ctx.db.from('sc_agent_docs').select('agent_id'),
      ctx.db.from('sc_agent_crons').select('agent_id'),
      ctx.db
        .from('sc_agent_model_config')
        .select('agent_id,desired_model,status,error,requested_at,applied_at'),
    ])
    if (reg.error) throw reg.error
    const modelConfig: Record<string, AgentModelConfigRow> = {}
    for (const m of (models.data ?? []) as unknown as AgentModelConfigRow[]) {
      modelConfig[m.agent_id] = m
    }
    const count = (rows: { agent_id: string }[] | null) => {
      const m: Record<string, number> = {}
      for (const r of rows ?? []) m[r.agent_id] = (m[r.agent_id] ?? 0) + 1
      return m
    }
    const skillCount = count(skills.data as never)
    const docCount = count(docs.data as never)
    const cronCount = count(crons.data as never)
    const agents = ((reg.data ?? []) as unknown as AgentRow[]).map(a => ({
      ...a,
      skills_count: skillCount[a.id] ?? 0,
      docs_count: docCount[a.id] ?? 0,
      crons_count: cronCount[a.id] ?? 0,
      model_config: modelConfig[a.id] ?? null,
    }))
    return { agents }
  }),

  // Route an agent to a different model. Writes a pending row; the host
  // applier (cron) makes it live and flips status to 'applied'.
  setModel: requireAction('admin.agents.manage')
    .input(
      z.object({
        agentId: z.string().min(1).max(64),
        model: z.enum(AGENT_MODELS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.db.from('sc_agent_model_config').upsert(
        {
          agent_id: input.agentId,
          desired_model: input.model,
          status: 'pending',
          error: null,
          requested_by: ctx.user?.email ?? null,
          requested_at: new Date().toISOString(),
          applied_at: null,
        },
        { onConflict: 'agent_id' },
      )
      if (error) throw error
      return { ok: true }
    }),

  /* ------------------------------------------------------ scheduled jobs --
   * Same shape as setModel and for the same reason: this API cannot reach the
   * host. A request lands as 'pending' in sc_cron_overrides and
   * ~/cron-override-apply.sh drains it, calling `openclaw cron edit/enable`.
   *
   * Deliberately narrow. Only gateway-scheduled jobs can be touched — the
   * system crontab is not reachable from here at all — and only WHEN a job
   * runs, never WHAT it runs. The applier re-checks the job exists and
   * re-validates the expression before it acts, so this validation is the
   * first of two gates rather than the only one.
   */
  cronOverrides: requireAction('admin.agents.view').query(async ({ ctx }) => {
    const { data, error } = await ctx.db
      .from('sc_cron_overrides')
      .select(
        'job_id,job_name,schedule,enabled,requested_by,requested_at,applied_at,apply_status,apply_error',
      )
      .order('requested_at', { ascending: false })
      .limit(100)
    if (error) throw error
    return (data ?? []) as unknown as CronOverrideRow[]
  }),

  setCronSchedule: requireAction('admin.agents.manage')
    .input(
      z.object({
        jobId: z.string().uuid(),
        jobName: z.string().min(1).max(200),
        // Five plain cron fields. Anything that could carry a shell argument is
        // rejected here and again on the host.
        schedule: z
          .string()
          .trim()
          .max(100)
          .regex(/^[-0-9*/, ]+$/, 'only digits and * , - / are allowed')
          .refine(s => s.split(/\s+/).length === 5, 'a schedule has exactly five fields')
          .nullable(),
        enabled: z.boolean().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.schedule === null && input.enabled === null) {
        throw new Error('nothing to change')
      }
      const { error } = await ctx.db.from('sc_cron_overrides').upsert(
        {
          job_id: input.jobId,
          job_name: input.jobName,
          schedule: input.schedule,
          enabled: input.enabled,
          requested_by: ctx.user?.email ?? 'unknown',
          requested_at: new Date().toISOString(),
          applied_at: null,
          apply_status: 'pending',
          apply_error: null,
        },
        { onConflict: 'job_id' },
      )
      if (error) throw error
      return { ok: true }
    }),

  detail: requireAction('admin.agents.view')
    .input(z.object({ id: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const [reg, skills, docs, crons, activity] = await Promise.all([
        ctx.db.from('sc_agent_registry').select(REGISTRY_SELECT).eq('id', input.id).maybeSingle(),
        ctx.db
          .from('sc_agent_skills')
          .select('id,agent_id,name,path,description,origin,scan_verdict,status')
          .eq('agent_id', input.id)
          .order('name'),
        ctx.db
          .from('sc_agent_docs')
          .select('id,agent_id,title,path,kind,size_bytes,modified_at')
          .eq('agent_id', input.id)
          .order('kind')
          .order('title'),
        ctx.db
          .from('sc_agent_crons')
          .select('id,agent_id,schedule,description,kind,enabled,last_status')
          .eq('agent_id', input.id)
          .order('kind'),
        ctx.db
          .from('sc_agent_activity')
          .select('id,agent_id,at,kind,title,detail,source')
          .eq('agent_id', input.id)
          .order('at', { ascending: false })
          .limit(100),
      ])
      if (reg.error) throw reg.error
      return {
        agent: (reg.data ?? null) as unknown as AgentRow | null,
        skills: (skills.data ?? []) as unknown as AgentSkillRow[],
        docs: (docs.data ?? []) as unknown as AgentDocRow[],
        crons: (crons.data ?? []) as unknown as AgentCronRow[],
        activity: (activity.data ?? []) as unknown as AgentActivityRow[],
      }
    }),

  skillContent: requireAction('admin.agents.view')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from('sc_agent_skills')
        .select('id,name,path,content')
        .eq('id', input.id)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as {
        id: string
        name: string
        path: string | null
        content: string | null
      } | null
    }),

  docContent: requireAction('admin.agents.view')
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from('sc_agent_docs')
        .select('id,title,path,kind,content')
        .eq('id', input.id)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as {
        id: string
        title: string
        path: string
        kind: string
        content: string | null
      } | null
    }),

  // The legal-office tab: every requirement in the compliance map, backed by a
  // specific Israeli law + section. Synced from ~/legal/מפת-ציות.json by the
  // host collector; this endpoint only reads.
  compliance: requireAction('admin.agents.view').query(async ({ ctx }) => {
    const [reqs, doms] = await Promise.all([
      ctx.db
        .from('sc_legal_requirements')
        .select(
          'id,domain,title,why,law,section,source_url,severity,status,doc_path,notes,resolver,resolver_how,task_prompt,sort_order,synced_at',
        )
        .order('domain')
        .order('sort_order'),
      ctx.db
        .from('sc_legal_domains')
        .select('name,icon,summary,applies,tags,sort_order')
        .order('sort_order'),
    ])
    if (reqs.error) throw reqs.error
    if (doms.error) throw doms.error
    return {
      requirements: (reqs.data ?? []) as unknown as LegalRequirementRow[],
      domains: (doms.data ?? []) as unknown as LegalDomainRow[],
    }
  }),

  stats: requireAction('admin.agents.view').query(async ({ ctx }) => {
    const [reg, skills, docs] = await Promise.all([
      ctx.db.from('sc_agent_registry').select('id,status,team,discrepancies,synced_at'),
      ctx.db.from('sc_agent_skills').select('id', { count: 'exact', head: true }),
      ctx.db.from('sc_agent_docs').select('id', { count: 'exact', head: true }),
    ])
    if (reg.error) throw reg.error
    const rows = (reg.data ?? []) as Array<{
      id: string
      status: string
      team: string
      discrepancies: string[]
      synced_at: string
    }>
    const active = rows.filter(
      r => r.status === 'active' || r.status === 'semi-active' || r.status === 'worker',
    ).length
    const discrepancies = rows.reduce(
      (n, r) => n + (Array.isArray(r.discrepancies) ? r.discrepancies.length : 0),
      0,
    )
    const lastSync = rows.reduce<string | null>(
      (m, r) => (!m || r.synced_at > m ? r.synced_at : m),
      null,
    )
    return {
      total: rows.length,
      active,
      teams: new Set(rows.map(r => r.team)).size,
      skills: skills.count ?? 0,
      docs: docs.count ?? 0,
      discrepancies,
      lastSync,
    }
  }),
})
