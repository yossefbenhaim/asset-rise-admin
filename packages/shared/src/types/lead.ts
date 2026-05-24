export type LeadSource = 'landing' | 'phone' | 'referral' | 'other' | 'analyzer'
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost'

export interface Lead {
  id: string
  name: string
  phone: string
  email: string | null
  city: string | null
  building_address: string | null
  message: string | null
  source: LeadSource
  status: LeadStatus
  assigned_to: string | null
  notes: string | null
  utm_source: string | null
  utm_campaign: string | null
  ip: string | null
  created_at: string
  updated_at: string
  contacted_at: string | null
  converted_at: string | null
}
