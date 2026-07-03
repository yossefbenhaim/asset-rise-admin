// MAVAT VPN doc-pipeline runs — observability for the Control Center. Reads the
// PII-safe run log (sc_doc_pipeline_runs) the host pipeline writes per plan:
// address → plan number → files downloaded/read → economics found → status.
// Pure read; no audit write (a monitor must not pollute what it renders).
import { z } from 'zod'
import { router, requireAction } from '../trpc.js'

const SELECT =
  'id,created_at,finished_at,source,plan_number,mp_id,job_id,city,street,building_number,gush,' +
  'zips_downloaded,pdfs_extracted,docs,economics_found,status,duration_s,stage,steps,downloaded_count,last_file'

export const pipelineRunsRouter = router({
  list: requireAction('admin.sources.view')
    .input(z.object({ limit: z.number().int().min(1).max(1000).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.db
        .from('sc_doc_pipeline_runs')
        .select(SELECT)
        .order('created_at', { ascending: false })
        .limit(input?.limit ?? 500)
      if (error) throw error
      return (data ?? []) as unknown as Array<{
        id: string
        created_at: string
        finished_at: string | null
        source: string | null
        plan_number: string | null
        mp_id: string | null
        job_id: string | null
        city: string | null
        street: string | null
        building_number: string | null
        gush: number | null
        zips_downloaded: number | null
        pdfs_extracted: number | null
        docs: Array<{ type: string; ai_visible: boolean; pii_removed: number }> | null
        economics_found: boolean | null
        status: string | null
        duration_s: number | null
        stage: string | null
        steps: Array<{ t: string; msg: string }> | null
        downloaded_count: number | null
        last_file: string | null
      }>
    }),
})
