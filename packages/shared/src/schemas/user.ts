import { z } from 'zod'

export const ListUsersInput = z.object({
  role: z.enum(['tenant', 'provider', 'admin']).optional(),
  q: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(500).default(200),
}).optional()
export type ListUsersInput = z.infer<typeof ListUsersInput>

export const UpdateUserLevelsInput = z.object({
  user_id: z.string().uuid(),
  tenant_levels: z.object({
    is_organizer: z.boolean(),
    is_committee_member: z.boolean(),
    is_committee_chair: z.boolean(),
  }).optional(),
  admin_levels: z.object({
    is_admin: z.boolean(),
    is_admin_support: z.boolean(),
    is_admin_sales: z.boolean(),
  }).optional(),
})
export type UpdateUserLevelsInput = z.infer<typeof UpdateUserLevelsInput>

export const DisableUserInput = z.object({
  user_id: z.string().uuid(),
  banned: z.boolean(),
})
export type DisableUserInput = z.infer<typeof DisableUserInput>

export const ListSubmissionsInput = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'rejected']).optional(),
  limit: z.number().int().min(1).max(500).default(200),
}).optional()
export type ListSubmissionsInput = z.infer<typeof ListSubmissionsInput>
