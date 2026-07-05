// Cost dashboard — every tool/service the business pays for, current + planned.
// Rollups are computed server-side in ILS (configurable USD rate) so the page
// renders one honest number: what we burn now, and what launch will add.
import { z } from 'zod'
import { router, requireAction } from '../trpc.js'

const CATEGORIES = ['infra', 'ai', 'comms', 'payments', 'marketing', 'legal', 'other'] as const
const STATUSES = ['active', 'planned', 'cancelled'] as const
const BILLINGS = ['monthly', 'annual', 'one_time', 'usage'] as const

const SELECT =
  'id,name,provider,category,status,amount,currency,billing,usage_note,is_estimate,expected_from,url,notes,created_at,updated_at'

export interface CostItem {
  id: string
  name: string
  provider: string | null
  category: string
  status: string
  amount: number
  currency: string
  billing: string
  usage_note: string | null
  is_estimate: boolean
  expected_from: string | null
  url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** monthly-equivalent in ILS: annual/12, one_time excluded, usage taken as-is */
function monthlyIls(i: Pick<CostItem, 'amount' | 'currency' | 'billing'>, usdRate: number): number {
  const ils = i.currency === 'USD' ? Number(i.amount) * usdRate : Number(i.amount)
  if (i.billing === 'annual') return ils / 12
  if (i.billing === 'one_time') return 0
  return ils // monthly + usage (usage = current monthly run-rate)
}

export const costsRouter = router({
  list: requireAction('admin.costs.view')
    .input(z.object({
      status: z.enum(STATUSES).optional(),
      category: z.enum(CATEGORIES).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      let q = ctx.db.from('sc_cost_items').select(SELECT).order('category').order('amount', { ascending: false })
      if (input?.status) q = q.eq('status', input.status)
      if (input?.category) q = q.eq('category', input.category)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as CostItem[]
    }),

  summary: requireAction('admin.costs.view')
    .input(z.object({ usdRate: z.number().min(1).max(10).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const usdRate = input?.usdRate ?? 3.7
      const { data, error } = await ctx.db.from('sc_cost_items').select(SELECT)
      if (error) throw error
      const items = (data ?? []) as unknown as CostItem[]
      const active = items.filter(i => i.status === 'active')
      const planned = items.filter(i => i.status === 'planned')
      const activeMonthly = active.reduce((s, i) => s + monthlyIls(i, usdRate), 0)
      const plannedMonthly = planned.reduce((s, i) => s + monthlyIls(i, usdRate), 0)
      const oneTimePlanned = planned
        .filter(i => i.billing === 'one_time')
        .reduce((s, i) => s + (i.currency === 'USD' ? Number(i.amount) * usdRate : Number(i.amount)), 0)
      const byCategory = CATEGORIES.map(c => ({
        category: c,
        active: active.filter(i => i.category === c).reduce((s, i) => s + monthlyIls(i, usdRate), 0),
        planned: planned.filter(i => i.category === c).reduce((s, i) => s + monthlyIls(i, usdRate), 0),
      })).filter(r => r.active > 0 || r.planned > 0)
      return {
        usdRate,
        activeMonthlyIls: Math.round(activeMonthly),
        plannedMonthlyIls: Math.round(plannedMonthly),
        launchMonthlyIls: Math.round(activeMonthly + plannedMonthly),
        annualNowIls: Math.round(activeMonthly * 12),
        oneTimePlannedIls: Math.round(oneTimePlanned),
        estimatesCount: items.filter(i => i.is_estimate && i.status !== 'cancelled').length,
        byCategory,
      }
    }),

  create: requireAction('admin.costs.manage')
    .input(z.object({
      name: z.string().trim().min(2).max(120),
      provider: z.string().max(120).optional(),
      category: z.enum(CATEGORIES).default('other'),
      status: z.enum(STATUSES).default('active'),
      amount: z.number().min(0).max(1_000_000),
      currency: z.enum(['ILS', 'USD']).default('ILS'),
      billing: z.enum(BILLINGS).default('monthly'),
      usage_note: z.string().max(400).optional(),
      is_estimate: z.boolean().default(false),
      expected_from: z.string().nullable().optional(),
      url: z.string().max(400).optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.db.from('sc_cost_items').insert({ ...input }).select(SELECT).single()
      if (error) throw error
      return data as unknown as CostItem
    }),

  update: requireAction('admin.costs.manage')
    .input(z.object({
      id: z.string().uuid(),
      patch: z.object({
        name: z.string().trim().min(2).max(120).optional(),
        provider: z.string().max(120).nullable().optional(),
        category: z.enum(CATEGORIES).optional(),
        status: z.enum(STATUSES).optional(),
        amount: z.number().min(0).max(1_000_000).optional(),
        currency: z.enum(['ILS', 'USD']).optional(),
        billing: z.enum(BILLINGS).optional(),
        usage_note: z.string().max(400).nullable().optional(),
        is_estimate: z.boolean().optional(),
        expected_from: z.string().nullable().optional(),
        url: z.string().max(400).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from('sc_cost_items')
        .update({ ...input.patch, updated_at: new Date().toISOString() })
        .eq('id', input.id)
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as CostItem
    }),

  remove: requireAction('admin.costs.manage')
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.db.from('sc_cost_items').delete().eq('id', input.id)
      if (error) throw error
      return { ok: true }
    }),
})
