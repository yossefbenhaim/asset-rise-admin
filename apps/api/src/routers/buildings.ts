import { TRPCError } from '@trpc/server'
import { router, requireAction } from '../trpc.js'

export const buildingsRouter = router({
  listAll: requireAction('admin.buildings.list').query(async ({ ctx }) => {
    const { data: buildings, error } = await ctx.db
      .from('sc_buildings')
      .select('id, address, city, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    if (!buildings?.length) return []

    const ids = buildings.map((b: any) => b.id)
    const [{ data: tenants }, { data: projects }] = await Promise.all([
      ctx.db.from('sc_tenant_profiles').select('building_id').in('building_id', ids),
      ctx.db.from('sc_projects').select('id, building_id, current_stage_id, name').in('building_id', ids),
    ])
    const tenantCount = new Map<string, number>()
    for (const t of tenants ?? []) {
      const k = (t as any).building_id as string
      tenantCount.set(k, (tenantCount.get(k) ?? 0) + 1)
    }
    const projectByBuilding = new Map<string, any>()
    for (const p of projects ?? []) {
      projectByBuilding.set((p as any).building_id, p)
    }
    return buildings.map((b: any) => ({
      ...b,
      tenant_count: tenantCount.get(b.id) ?? 0,
      project: projectByBuilding.get(b.id) ?? null,
    }))
  }),
})
