import { TRPCError } from '@trpc/server'
import { router, requireAction } from '../trpc.js'
import {
  ListPaymentsInput,
  type PaymentsList,
  type PaymentRow,
  type PaymentTotals,
  type PaymentStatus,
} from '@asset-rise/shared'

// Map a raw sc_payments row to the flat admin PaymentRow shape (defensive: the
// table is mock-seeded today and will later be fed by a Stripe/PayPal webhook,
// so we coerce nullable + numeric fields rather than trust them).
function toRow(r: Record<string, any>): PaymentRow {
  return {
    id: String(r.id),
    user_id: (r.user_id as string) ?? null,
    lead_email: (r.lead_email as string) ?? null,
    report_token: (r.report_token as string) ?? null,
    amount: typeof r.amount === 'number' ? r.amount : Number(r.amount ?? 0),
    currency: (r.currency as string) ?? 'ILS',
    status: (r.status as PaymentStatus) ?? 'pending',
    provider: (r.provider as string) ?? null,
    txn_id: (r.txn_id as string) ?? null,
    created_at: r.created_at as string,
    paid_at: (r.paid_at as string) ?? null,
    refunded_at: (r.refunded_at as string) ?? null,
  }
}

// Aggregate KPI totals over the FULL set of rows (always unfiltered) so the
// cards stay stable while the table is being filtered client/server-side.
function computeTotals(rows: PaymentRow[]): PaymentTotals {
  const t: PaymentTotals = {
    revenue_paid: 0,
    amount_refunded: 0,
    count_total: rows.length,
    count_paid: 0,
    count_pending: 0,
    count_failed: 0,
    count_refunded: 0,
    currency: rows[0]?.currency ?? 'ILS',
  }
  for (const r of rows) {
    switch (r.status) {
      case 'paid':
        t.count_paid++
        t.revenue_paid += r.amount
        break
      case 'pending':
        t.count_pending++
        break
      case 'failed':
        t.count_failed++
        break
      case 'refunded':
        t.count_refunded++
        t.amount_refunded += r.amount
        break
    }
  }
  return t
}

export const paymentsRouter = router({
  // List payments (newest first) + precomputed KPI totals. Totals are computed
  // over ALL payments; the optional `status` input only narrows the returned
  // rows, leaving the headline numbers intact.
  list: requireAction('admin.payments.list')
    .input(ListPaymentsInput)
    .query(async ({ ctx, input }): Promise<PaymentsList> => {
      const { data, error } = await ctx.db
        .from('sc_payments')
        .select(
          'id,user_id,lead_email,report_token,amount,currency,status,provider,txn_id,created_at,paid_at,refunded_at',
        )
        .order('created_at', { ascending: false })
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })

      const all = (data ?? []).map(toRow)
      const totals = computeTotals(all)
      const rows = input?.status ? all.filter(r => r.status === input.status) : all
      return { rows, totals }
    }),
})
