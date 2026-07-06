import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, requireRole, requireAction } from '../trpc.js'
import { ListUsersInput, UpdateUserLevelsInput, DisableUserInput } from '@asset-rise/shared'
import { audit } from '../lib/audit.js'

export const usersRouter = router({
  list: requireAction('admin.users.list')
    .input(ListUsersInput)
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 200
      let q = ctx.db
        .from('sc_profiles')
        .select('id, email, full_name, phone, role, provider_type, created_at')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (input?.role) q = q.eq('role', input.role)
      if (input?.q) {
        const t = `%${input.q}%`
        q = q.or(`full_name.ilike.${t},email.ilike.${t},phone.ilike.${t}`)
      }
      const { data, error } = await q
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),

  get: requireAction('admin.users.list')
    .input(z.string().uuid())
    .query(async ({ ctx, input }) => {
      const { data: p, error } = await ctx.db
        .from('sc_profiles')
        .select('id, email, full_name, phone, role, provider_type, created_at')
        .eq('id', input)
        .maybeSingle()
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      if (!p) throw new TRPCError({ code: 'NOT_FOUND' })
      const out: any = { ...p }
      if (p.role === 'tenant') {
        const { data: tp } = await ctx.db
          .from('sc_tenant_profiles')
          .select(
            'building_id, apartment_number, is_organizer, is_committee_member, is_committee_chair',
          )
          .eq('id', input)
          .maybeSingle()
        out.tenant_profile = tp ?? null
      } else if (p.role === 'admin') {
        const { data: ap } = await ctx.db
          .from('sc_admin_profiles')
          .select('is_admin, is_admin_support, is_admin_sales')
          .eq('id', input)
          .maybeSingle()
        out.admin_profile = ap ?? null
      }
      return out
    }),

  updateLevels: requireRole('admin')
    .input(UpdateUserLevelsInput)
    .mutation(async ({ ctx, input }) => {
      const { data: target } = await ctx.db
        .from('sc_profiles')
        .select('role')
        .eq('id', input.user_id)
        .maybeSingle()
      if (!target) throw new TRPCError({ code: 'NOT_FOUND' })

      if (input.tenant_levels && target.role === 'tenant') {
        const { error } = await ctx.db
          .from('sc_tenant_profiles')
          .update(input.tenant_levels)
          .eq('id', input.user_id)
        if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }
      if (input.admin_levels && target.role === 'admin') {
        const { error } = await ctx.db
          .from('sc_admin_profiles')
          .update(input.admin_levels)
          .eq('id', input.user_id)
        if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }
      await audit(ctx.db, {
        actor_id: ctx.user.id,
        action: 'admin.user.update_levels',
        target_type: 'user',
        target_id: input.user_id,
        meta: { tenant_levels: input.tenant_levels, admin_levels: input.admin_levels },
        ip: ctx.ip,
      })
      return { ok: true }
    }),

  disable: requireRole('admin')
    .input(DisableUserInput)
    .mutation(async ({ ctx, input }) => {
      if (input.user_id === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'אי אפשר להשבית את עצמך' })
      }
      const { error } = await ctx.db.auth.admin.updateUserById(input.user_id, {
        ban_duration: input.banned ? '876000h' : 'none',
      })
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      await audit(ctx.db, {
        actor_id: ctx.user.id,
        action: 'admin.user.disable',
        target_type: 'user',
        target_id: input.user_id,
        meta: { banned: input.banned },
        ip: ctx.ip,
      })
      return { ok: true }
    }),

  delete: requireRole('admin')
    .input(z.string().uuid())
    .mutation(async ({ ctx, input }) => {
      if (input === ctx.user.id) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'אי אפשר למחוק את עצמך' })
      }
      await ctx.db.from('sc_profiles').delete().eq('id', input)
      const { error } = await ctx.db.auth.admin.deleteUser(input)
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      await audit(ctx.db, {
        actor_id: ctx.user.id,
        action: 'admin.user.delete',
        target_type: 'user',
        target_id: input,
        ip: ctx.ip,
      })
      return { ok: true }
    }),
})
