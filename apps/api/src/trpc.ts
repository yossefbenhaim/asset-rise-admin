import { initTRPC, TRPCError } from '@trpc/server'
import type { AppContext } from './context.js'
import type { Action, Role, RoleKey } from '@asset-rise/shared'
import { can } from './lib/permissions.js'

const t = initTRPC.context<AppContext>().create()

export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, user: ctx.user } })
})

export function requireRole(role: Role) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (ctx.user.role !== role) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `requires ${role} role` })
    }
    return next({ ctx })
  })
}

export function requireLevel(level: RoleKey) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!ctx.roleKeys.includes(level)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `requires ${level}` })
    }
    return next({ ctx })
  })
}

export function requireAction(action: Action) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const ok = await can(ctx.db, ctx.roleKeys, action)
    if (!ok) throw new TRPCError({ code: 'FORBIDDEN', message: `missing ${action}` })
    return next({ ctx })
  })
}
