// Outreach center — B2B sales targets (organizers / developers / tenant-lawyers).
// The 100-target public-sources list lives in sc_outreach_targets; Yossef tracks
// call status, edits per-target drafts and contact details, adds new people, and
// a host cron reminds him via Telegram to keep the day-45 discovery pace.
import { z } from 'zod'
import { router, requireAction } from '../trpc.js'

const STATUSES = ['new', 'approached', 'call_scheduled', 'called', 'gave_addresses', 'pilot', 'customer', 'not_relevant'] as const
const TYPES = ['organizer', 'developer', 'lawyer', 'other'] as const

const SELECT =
  'id,rank,name,type,city_region,evidence,source_url,phone,email,public_contact,' +
  'pitch_angle,suggested_deck,draft_message,status,notes,next_followup_at,last_contact_at,created_at,updated_at'

export interface OutreachTarget {
  id: string
  rank: number | null
  name: string
  type: string
  city_region: string | null
  evidence: string | null
  source_url: string | null
  phone: string | null
  email: string | null
  public_contact: string | null
  pitch_angle: string | null
  suggested_deck: string | null
  draft_message: string | null
  status: string
  notes: string | null
  next_followup_at: string | null
  last_contact_at: string | null
  created_at: string
  updated_at: string
}

export const outreachRouter = router({
  list: requireAction('admin.outreach.view')
    .input(z.object({
      status: z.enum(STATUSES).optional(),
      type: z.enum(TYPES).optional(),
      q: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      let qy = ctx.db.from('sc_outreach_targets').select(SELECT)
        .order('rank', { ascending: true, nullsFirst: false })
        .limit(input?.limit ?? 300)
      if (input?.status) qy = qy.eq('status', input.status)
      if (input?.type) qy = qy.eq('type', input.type)
      if (input?.q) qy = qy.or(`name.ilike.%${input.q}%,city_region.ilike.%${input.q}%`)
      const { data, error } = await qy
      if (error) throw error
      return (data ?? []) as unknown as OutreachTarget[]
    }),

  // Pace stats for the day-45 gate: calls made (status reached called+),
  // gate start (first contact), days elapsed, and due follow-ups.
  stats: requireAction('admin.outreach.view').query(async ({ ctx }) => {
    const { data, error } = await ctx.db
      .from('sc_outreach_targets')
      .select('status,last_contact_at,next_followup_at')
    if (error) throw error
    const rows = (data ?? []) as Array<{ status: string; last_contact_at: string | null; next_followup_at: string | null }>
    const CALLED = new Set(['called', 'gave_addresses', 'pilot', 'customer'])
    const calls = rows.filter(r => CALLED.has(r.status))
    const contacts = rows.map(r => r.last_contact_at).filter(Boolean).sort() as string[]
    const gateStart = contacts[0] ?? null
    const daysElapsed = gateStart ? Math.floor((Date.now() - new Date(gateStart).getTime()) / 86400000) : 0
    const now = new Date().toISOString()
    return {
      total: rows.length,
      byStatus: STATUSES.reduce((acc, s) => ({ ...acc, [s]: rows.filter(r => r.status === s).length }), {} as Record<string, number>),
      callsDone: calls.length,
      callsTarget: 10,
      gateStart,
      daysElapsed,
      gateDays: 45,
      followupsDue: rows.filter(r => r.next_followup_at && r.next_followup_at <= now && !CALLED.has(r.status)).length,
    }
  }),

  create: requireAction('admin.outreach.manage')
    .input(z.object({
      name: z.string().trim().min(2).max(160),
      type: z.enum(TYPES).default('organizer'),
      city_region: z.string().max(200).optional(),
      phone: z.string().max(60).optional(),
      email: z.string().max(160).optional(),
      evidence: z.string().max(2000).optional(),
      source_url: z.string().max(500).optional(),
      pitch_angle: z.string().max(1000).optional(),
      notes: z.string().max(4000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from('sc_outreach_targets')
        .insert({ ...input })
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as OutreachTarget
    }),

  update: requireAction('admin.outreach.manage')
    .input(z.object({
      id: z.string().uuid(),
      patch: z.object({
        name: z.string().trim().min(2).max(160).optional(),
        type: z.enum(TYPES).optional(),
        city_region: z.string().max(200).nullable().optional(),
        phone: z.string().max(60).nullable().optional(),
        email: z.string().max(160).nullable().optional(),
        public_contact: z.string().max(400).nullable().optional(),
        evidence: z.string().max(2000).nullable().optional(),
        source_url: z.string().max(500).nullable().optional(),
        pitch_angle: z.string().max(1000).nullable().optional(),
        suggested_deck: z.string().max(200).nullable().optional(),
        draft_message: z.string().max(4000).nullable().optional(),
        status: z.enum(STATUSES).optional(),
        notes: z.string().max(4000).nullable().optional(),
        next_followup_at: z.string().nullable().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = { ...input.patch, updated_at: new Date().toISOString() }
      // moving into any contacted-ish status stamps last_contact_at (once per move)
      if (input.patch.status && input.patch.status !== 'new' && input.patch.status !== 'not_relevant') {
        patch.last_contact_at = new Date().toISOString()
      }
      const { data, error } = await ctx.db
        .from('sc_outreach_targets')
        .update(patch)
        .eq('id', input.id)
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as OutreachTarget
    }),

  remove: requireAction('admin.outreach.manage')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.db.from('sc_outreach_targets').delete().eq('id', input.id)
      if (error) throw error
      return { ok: true }
    }),
})
