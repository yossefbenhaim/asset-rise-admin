// Reports Management — admin Control Center types + Zod inputs.
// Backs apps/api/src/routers/reports.ts and apps/web/src/features/reports/*.
// The `report` jsonb on sc_analyzer_reports is the customer app's full
// EvaluateResponse; admin reads a handful of fields out of it (address.city,
// address.gush/chelka, ai.key for re-enqueue) without depending on the whole
// shape. We keep a loose `report: unknown` and parse defensively server-side.
import { z } from 'zod'

// Derived pipeline status for an admin report row. A row with a persisted
// `report` jsonb is 'completed'; otherwise we fall back to the matching
// sc_analyzer_jobs status (by research_key) → running/pending/failed.
export type ReportStatus = 'completed' | 'processing' | 'queued' | 'failed'

// One row in the admin reports table — flattened for DataTable + CSV.
// `type` (not `interface`) so it structurally satisfies the DataTable generic
// constraint `T extends Record<string, unknown>`.
export type ReportRow = {
  token: string
  address_display: string | null
  city: string | null
  gush: number | null
  helka: number | null
  score: number | null
  status: ReportStatus
  created_at: string
  accessed_at: string | null
  lead_name: string | null
  lead_email: string | null
  paid: boolean
  pinned: boolean
}

// Internal admin flag for a report (pin + note). Mirrors sc_report_flags.
export interface ReportFlag {
  report_token: string
  admin_id: string | null
  pinned: boolean
  note: string | null
  updated_at: string | null
}

// The matching async research job for a report (status/error/key), if any.
export interface ReportJob {
  id: string | null
  research_key: string | null
  status: ReportStatus | 'done'
  error: string | null
  attempts: number | null
  updated_at: string | null
  completed_at: string | null
}

// Full detail payload returned by reports.get(token).
export interface ReportDetail {
  token: string
  address_display: string | null
  address_key: string | null
  city: string | null
  gush: number | null
  helka: number | null
  score: number | null
  status: ReportStatus
  created_at: string
  accessed_at: string | null
  lead_name: string | null
  lead_phone: string | null
  lead_email: string | null
  paid: boolean
  research_key: string | null
  // Full EvaluateResponse jsonb — rendered as a summary in the drawer.
  report: unknown
  job: ReportJob | null
  flag: ReportFlag | null
}

// ── Inputs ─────────────────────────────────────────────────────────────
export const ReportTokenInput = z.object({ token: z.string().min(1).max(120) })
export type ReportTokenInput = z.infer<typeof ReportTokenInput>

// Re-enqueue the report's research job (full re-run). `ai_only` marks an AI
// refresh (regenerateAi) so the worker can choose a lighter path; both flow
// through the same pending insert keyed by research_key.
export const RerunReportInput = z.object({
  token: z.string().min(1).max(120),
  ai_only: z.boolean().optional(),
})
export type RerunReportInput = z.infer<typeof RerunReportInput>

// Patch editable fields on the report jsonb + the top-level mirror columns.
export const UpdateReportFieldsInput = z.object({
  token: z.string().min(1).max(120),
  score: z.number().int().min(0).max(100).optional(),
  address_display: z.string().min(1).max(200).optional(),
})
export type UpdateReportFieldsInput = z.infer<typeof UpdateReportFieldsInput>

// Upsert the internal flag (pin + note) for a report.
export const SetReportFlagInput = z.object({
  token: z.string().min(1).max(120),
  pinned: z.boolean().optional(),
  note: z.string().max(2000).nullable().optional(),
})
export type SetReportFlagInput = z.infer<typeof SetReportFlagInput>
