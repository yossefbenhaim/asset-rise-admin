import { z } from 'zod'

export const LeadSourceSchema = z.enum(['landing', 'phone', 'referral', 'other'])
export const LeadStatusSchema = z.enum(['new', 'contacted', 'qualified', 'converted', 'lost'])

// Public contact-form input — anonymous, hits leads.create.
export const CreateLeadInput = z.object({
  name: z.string().min(2, 'שם חובה').max(80),
  phone: z.string().regex(/^[0-9+\-\s]{9,15}$/, 'טלפון לא תקין'),
  email: z.string().email('אימייל לא תקין').optional().or(z.literal('')),
  city: z.string().max(80).optional(),
  building_address: z.string().max(200).optional(),
  message: z.string().max(1000).optional(),
  utm_source: z.string().max(80).optional(),
  utm_campaign: z.string().max(80).optional(),
  // Optional source tag. Defaults to 'landing' when omitted (Silver Castle
  // marketing form). Trusted servers can pass 'analyzer' / 'referral' / etc.
  source: LeadSourceSchema.optional(),
})
export type CreateLeadInput = z.infer<typeof CreateLeadInput>

export const UpdateLeadInput = z.object({
  id: z.string().uuid(),
  status: LeadStatusSchema.optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).optional(),
})
export type UpdateLeadInput = z.infer<typeof UpdateLeadInput>

export const ListLeadsInput = z.object({
  status: LeadStatusSchema.optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  q: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(500).default(200),
}).optional()
export type ListLeadsInput = z.infer<typeof ListLeadsInput>
