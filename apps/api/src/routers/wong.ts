// Wong — monitor for the document-verification agent (host worker
// ~/document-verify-worker.sh). The worker drains sc_doc_verifications
// (migration 080), runs each uploaded tenant document through an LLM, and writes
// back verdict jsonb { approved, reason_he, confidence }. This router is a
// READ-ONLY window onto that table for the admin Control Center.
//
// We resolve the document + tenant with batched follow-up queries (the
// codebase's manual-join pattern, see submissions.ts) rather than PostgREST FK
// embedding, to stay robust to cascade gaps. No audit write — a read-only
// monitor must not pollute the log it could later surface.
import { TRPCError } from '@trpc/server'
import { router, requireAction } from '../trpc.js'
import {
  WongListInput,
  type WongStats,
  type WongVerification,
  type WongStatus,
  type WongConfidence,
} from '@asset-rise/shared'

interface VerificationRow {
  id: string
  document_id: string | null
  status: WongStatus
  doc_label: string | null
  task_title: string | null
  mime_type: string | null
  verdict: unknown
  error: string | null
  attempts: number | null
  created_at: string
  completed_at: string | null
}

interface DocRow {
  id: string
  user_id: string | null
  file_name: string | null
  category: string | null
}

interface ProfileRow {
  id: string
  full_name: string | null
}

type Verdict = { approved?: boolean; reason_he?: string; confidence?: string }

function readVerdict(raw: unknown): Verdict {
  if (raw && typeof raw === 'object') return raw as Verdict
  return {}
}

function confidenceOf(v: Verdict): WongConfidence | null {
  return v.confidence === 'high' || v.confidence === 'medium' || v.confidence === 'low'
    ? v.confidence
    : null
}

const ROW_SELECT =
  'id,document_id,status,doc_label,task_title,mime_type,verdict,error,attempts,created_at,completed_at'

export const wongRouter = router({
  // KPI counters. `today` is computed from local midnight (server tz) so the
  // dashboard's "today" matches the operator's day.
  stats: requireAction('admin.docverify.view').query(async ({ ctx }): Promise<WongStats> => {
    const startToday = new Date()
    startToday.setHours(0, 0, 0, 0)

    const count = (q: { count: number | null }) => q.count ?? 0

    try {
      const [pending, running, failed, total, today, doneRows] = await Promise.all([
        ctx.db
          .from('sc_doc_verifications')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        ctx.db
          .from('sc_doc_verifications')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'running'),
        ctx.db
          .from('sc_doc_verifications')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'failed'),
        ctx.db.from('sc_doc_verifications').select('id', { count: 'exact', head: true }),
        ctx.db
          .from('sc_doc_verifications')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startToday.toISOString()),
        // DONE rows split into approved/rejected by their verdict.
        ctx.db.from('sc_doc_verifications').select('verdict').eq('status', 'done'),
      ])

      let approved = 0
      let rejected = 0
      for (const r of (doneRows.data as { verdict: unknown }[] | null) ?? []) {
        if (readVerdict(r.verdict).approved === true) approved++
        else rejected++
      }

      return {
        // queue = pending + running.
        pending: count(pending) + count(running),
        approved,
        rejected,
        failed: count(failed),
        total: count(total),
        today: count(today),
      }
    } catch (e: any) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
    }
  }),

  // Recent verifications, newest first, flattened with doc + tenant info.
  list: requireAction('admin.docverify.view')
    .input(WongListInput.optional())
    .query(async ({ ctx, input }): Promise<WongVerification[]> => {
      const limit = input?.limit ?? 200
      const status = input?.status ?? 'all'

      try {
        let q = ctx.db
          .from('sc_doc_verifications')
          .select(ROW_SELECT)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (status !== 'all') q = q.eq('status', status)

        const { data, error } = await q
        if (error) throw error
        const rows = (data as VerificationRow[] | null) ?? []
        if (rows.length === 0) return []

        // Batch-resolve documents, then their owning tenants.
        const docIds = [...new Set(rows.map(r => r.document_id).filter((x): x is string => !!x))]
        const docsRes = docIds.length
          ? await ctx.db
              .from('sc_tenant_documents')
              .select('id,user_id,file_name,category')
              .in('id', docIds)
          : { data: [] as DocRow[] }
        const docs = new Map((((docsRes as any).data as DocRow[] | null) ?? []).map(d => [d.id, d]))

        const userIds = [
          ...new Set([...docs.values()].map(d => d.user_id).filter((x): x is string => !!x)),
        ]
        const profRes = userIds.length
          ? await ctx.db.from('sc_profiles').select('id,full_name').in('id', userIds)
          : { data: [] as ProfileRow[] }
        const profiles = new Map(
          (((profRes as any).data as ProfileRow[] | null) ?? []).map(p => [p.id, p]),
        )

        return rows.map((r): WongVerification => {
          const doc = r.document_id ? (docs.get(r.document_id) ?? null) : null
          const tenant = doc?.user_id ? (profiles.get(doc.user_id)?.full_name ?? null) : null
          const v = readVerdict(r.verdict)
          const decided = r.status === 'done'
          return {
            id: r.id,
            status: r.status,
            docLabel: r.doc_label ?? '—',
            taskTitle: r.task_title ?? '—',
            docName: doc?.file_name ?? null,
            docCategory: doc?.category ?? null,
            mimeType: r.mime_type ?? null,
            tenant,
            aiApproved: decided && typeof v.approved === 'boolean' ? v.approved : null,
            reason: typeof v.reason_he === 'string' ? v.reason_he : null,
            confidence: confidenceOf(v),
            error: r.error ?? null,
            attempts: r.attempts ?? 0,
            createdAt: r.created_at,
            completedAt: r.completed_at ?? null,
          }
        })
      } catch (e: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message })
      }
    }),
})
