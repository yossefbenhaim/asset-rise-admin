// Payments — admin Control Center types + Zod inputs.
// Backs apps/api/src/routers/payments.ts and apps/web/src/features/payments/*.
// Source table sc_payments is currently MOCK/DEMO-seeded but is shaped for a
// future Stripe/PayPal webhook ingest (provider + txn_id + lifecycle stamps),
// so the admin surface is already wired to the real columns.
import { z } from 'zod'

// Lifecycle of a single payment. Matches sc_payments.status and the values
// StatusBadge already knows how to render (paid/pending/failed/refunded).
export type PaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded'

// One row in the admin payments table — flattened for DataTable + CSV.
// `type` (not `interface`) so it structurally satisfies the DataTable generic
// constraint `T extends Record<string, unknown>`.
export type PaymentRow = {
  id: string
  user_id: string | null
  lead_email: string | null
  report_token: string | null
  amount: number
  currency: string
  status: PaymentStatus
  provider: string | null
  txn_id: string | null
  created_at: string
  paid_at: string | null
  refunded_at: string | null
}

// Aggregate totals returned alongside the rows so the page can render KPIs
// without re-summing client-side (and so paid revenue ignores refunds/fails).
export interface PaymentTotals {
  // Sum of `amount` over status='paid' rows only.
  revenue_paid: number
  // Sum of `amount` over status='refunded' rows (money returned).
  amount_refunded: number
  // Row counts by status.
  count_total: number
  count_paid: number
  count_pending: number
  count_failed: number
  count_refunded: number
  // ISO currency code reported by the rows (assumed homogeneous; first seen).
  currency: string
}

// Envelope: rows + precomputed totals.
export interface PaymentsList {
  rows: PaymentRow[]
  totals: PaymentTotals
}

// ── Inputs ─────────────────────────────────────────────────────────────
// Optional status filter for payments.list. Totals are always computed over
// the FULL set (unfiltered) so the KPI cards stay stable while filtering rows.
export const ListPaymentsInput = z
  .object({
    status: z.enum(['paid', 'pending', 'failed', 'refunded']).optional(),
  })
  .optional()
export type ListPaymentsInput = z.infer<typeof ListPaymentsInput>
