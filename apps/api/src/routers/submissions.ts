import { TRPCError } from '@trpc/server'
import { router, requireAction } from '../trpc.js'
import { ListSubmissionsInput } from '@asset-rise/shared'

export const submissionsRouter = router({
  listAll: requireAction('admin.submissions.list')
    .input(ListSubmissionsInput)
    .query(async ({ ctx, input }) => {
      let q = ctx.db
        .from('sc_submissions')
        .select('id, building_id, submitter_id, kind, title, body, status, created_at')
        .order('created_at', { ascending: false })
        .limit(input?.limit ?? 200)
      if (input?.status) q = q.eq('status', input.status)
      const { data, error } = await q
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      if (!data?.length) return []

      const buildingIds = Array.from(new Set(data.map((r: any) => r.building_id)))
      const submitterIds = Array.from(new Set(data.map((r: any) => r.submitter_id)))
      const [{ data: bldgs }, { data: profs }] = await Promise.all([
        ctx.db
          .from('sc_buildings')
          .select('id, city, street, building_number')
          .in('id', buildingIds),
        ctx.db.from('sc_profiles').select('id, full_name, email').in('id', submitterIds),
      ])
      const bldgMap = new Map(
        (bldgs ?? []).map((b: any) => [
          b.id,
          {
            ...b,
            address: [b.street, b.building_number].filter(Boolean).join(' '),
          },
        ]),
      )
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]))
      return data.map((r: any) => ({
        ...r,
        building: bldgMap.get(r.building_id) ?? null,
        submitter: profMap.get(r.submitter_id) ?? null,
      }))
    }),
})
