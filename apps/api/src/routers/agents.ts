// Agents Center — read-only dashboard of the whole OpenClaw agent estate.
// Data is pushed by the HOST collector (~/.openclaw/scripts/agents-center-sync.py)
// into sc_agent_* snapshot tables; this router only reads. Doc/skill file
// contents are fetched lazily (they can be large) via docContent/skillContent.
import { z } from 'zod'
import { router, requireAction } from '../trpc.js'

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
  sort_order: number
  synced_at: string
}

export const agentsRouter = router({
  list: requireAction('admin.agents.view').query(async ({ ctx }) => {
    const [reg, skills, docs, crons] = await Promise.all([
      ctx.db.from('sc_agent_registry').select(REGISTRY_SELECT).order('team').order('name'),
      ctx.db.from('sc_agent_skills').select('agent_id'),
      ctx.db.from('sc_agent_docs').select('agent_id'),
      ctx.db.from('sc_agent_crons').select('agent_id'),
    ])
    if (reg.error) throw reg.error
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
    }))
    return { agents }
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
    const { data, error } = await ctx.db
      .from('sc_legal_requirements')
      .select(
        'id,domain,title,why,law,section,source_url,severity,status,doc_path,notes,sort_order,synced_at',
      )
      .order('domain')
      .order('sort_order')
    if (error) throw error
    return { requirements: (data ?? []) as unknown as LegalRequirementRow[] }
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
