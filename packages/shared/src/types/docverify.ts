// Wong — the document-verification agent monitor. Backs
// apps/api/src/routers/wong.ts and apps/web/src/features/wong/*.
//
// "Wong" is the HOST worker ~/document-verify-worker.sh: it reads pending rows
// from sc_doc_verifications (migration 080), runs each uploaded tenant document
// through an LLM, and writes a verdict back ({ approved, reason_he, confidence })
// before a document-gated workflow task can be marked complete. This module is a
// READ-ONLY window onto that table for the admin Control Center — no mutations.
import { z } from 'zod'

// Raw job statuses on sc_doc_verifications.
export type WongStatus = 'pending' | 'running' | 'done' | 'failed'

// The LLM verdict confidence levels the worker emits.
export type WongConfidence = 'high' | 'medium' | 'low'

// Aggregate counters for the KPI row. The "approved/rejected" split is derived
// from the verdict on DONE rows (status 'done' + verdict.approved), while
// "pending" folds the queue states ('pending' + 'running').
export type WongStats = {
  // Queue waiting to be (or being) verified.
  pending: number
  // DONE rows the agent APPROVED.
  approved: number
  // DONE rows the agent REJECTED.
  rejected: number
  // Jobs that errored out (status 'failed').
  failed: number
  // Everything, all-time.
  total: number
  // Verifications created since local midnight.
  today: number
}

// One verification row, flattened with the document + tenant it concerns.
// `type` (not `interface`) so it satisfies the DataTable generic constraint
// `T extends Record<string, unknown>`.
export type WongVerification = {
  id: string
  // Raw job status.
  status: WongStatus
  // The expected document the agent verifies the upload against (Hebrew label).
  docLabel: string
  // The task this document gates.
  taskTitle: string
  // Uploaded document file name (from sc_tenant_documents) — null if the row is
  // gone (cascade leaves the verification, defensively nullable).
  docName: string | null
  // Document category key (tabu / power_of_attorney / …).
  docCategory: string | null
  mimeType: string | null
  // The tenant who uploaded it (sc_profiles.full_name) — null if unresolved.
  tenant: string | null
  // The agent's final answer: true approved, false rejected, null not yet
  // decided (pending/running/failed).
  aiApproved: boolean | null
  // Hebrew explanation the agent gave (verdict.reason_he).
  reason: string | null
  // Verdict confidence, when present.
  confidence: WongConfidence | null
  // Error text for failed jobs.
  error: string | null
  attempts: number
  createdAt: string
  completedAt: string | null
}

// ── Inputs ─────────────────────────────────────────────────────────────
// Optional status filter ('all' or omitted = no filter) + result cap.
export const WongListInput = z.object({
  status: z.enum(['pending', 'running', 'done', 'failed', 'all']).optional(),
  limit: z.number().int().min(1).max(500).optional(),
})
export type WongListInput = z.infer<typeof WongListInput>
