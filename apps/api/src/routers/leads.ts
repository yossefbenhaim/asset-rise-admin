import { TRPCError } from '@trpc/server'
import { router, publicProcedure, requireAction } from '../trpc.js'
import { CreateLeadInput, UpdateLeadInput, ListLeadsInput, type Lead } from '@asset-rise/shared'
import { audit } from '../lib/audit.js'
import { notify } from '../repos/notification.repo.js'
import { insertLead, listLeads, updateLead, adminRecipientIds } from '../repos/lead.repo.js'

// Simple in-memory rate limiter for the anonymous create endpoint:
// 5 req / 60s / IP. Map prunes opportunistically.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 5
const hits = new Map<string, number[]>()

function checkRate(ip: string | null): void {
  const key = ip ?? 'unknown'
  const now = Date.now()
  const arr = (hits.get(key) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  if (arr.length >= RATE_MAX) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'יותר מדי בקשות, נסה שוב בעוד דקה',
    })
  }
  arr.push(now)
  hits.set(key, arr)
  if (hits.size > 1000) {
    for (const [k, v] of hits) {
      if (v.every(t => now - t >= RATE_WINDOW_MS)) hits.delete(k)
    }
  }
}

export const leadsRouter = router({
  create: publicProcedure
    .input(CreateLeadInput)
    .mutation(async ({ ctx, input }): Promise<Lead> => {
      checkRate(ctx.ip)
      let row: Lead
      try {
        row = await insertLead(ctx.db, input, ctx.ip)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
      await audit(ctx.db, {
        actor_id: null,
        action: 'lead.create',
        target_type: 'lead',
        target_id: row.id,
        meta: { source: row.source, has_email: !!row.email },
        ip: ctx.ip,
      })
      const recipients = await adminRecipientIds(ctx.db)
      await notify({
        db: ctx.db,
        recipient_ids: recipients,
        kind: 'lead.received',
        title: `פנייה חדשה: ${row.name}`,
        body: row.phone,
        link: '/leads',
        payload: { lead_id: row.id, source: row.source },
      })
      return row
    }),

  list: requireAction('admin.leads.list')
    .input(ListLeadsInput)
    .query(async ({ ctx, input }): Promise<Lead[]> => {
      try {
        return await listLeads(ctx.db, input)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
    }),

  update: requireAction('admin.leads.update')
    .input(UpdateLeadInput)
    .mutation(async ({ ctx, input }): Promise<Lead> => {
      let row: Lead
      try {
        row = await updateLead(ctx.db, input)
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
      await audit(ctx.db, {
        actor_id: ctx.user.id,
        action: 'lead.update',
        target_type: 'lead',
        target_id: row.id,
        meta: { status: input.status, assigned_to: input.assigned_to },
        ip: ctx.ip,
      })
      return row
    }),
})
