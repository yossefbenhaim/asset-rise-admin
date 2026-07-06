import { useState } from 'react'
import { trpc } from '@/lib/api/trpc'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import type { Lead } from '@asset-rise/shared'

const STATUS_LABEL: Record<string, string> = {
  new: 'חדש',
  contacted: 'בטיפול',
  qualified: 'מתאים',
  converted: 'הומר',
  lost: 'נסגר',
}

const STATUS_PILL: Record<string, 'info' | 'warning' | 'success' | 'gold' | 'neutral'> = {
  new: 'warning',
  contacted: 'info',
  qualified: 'gold',
  converted: 'success',
  lost: 'neutral',
}

const SOURCE_LABEL: Record<string, string> = {
  landing: 'אתר ראשי',
  analyzer: 'מנתח היתכנות',
  phone: 'טלפון',
  referral: 'הפנייה',
  other: 'אחר',
}

const SOURCE_PILL: Record<string, 'info' | 'gold' | 'navy' | 'neutral'> = {
  landing: 'info',
  analyzer: 'gold',
  phone: 'navy',
  referral: 'navy',
  other: 'neutral',
}

export default function AdminLeads() {
  const [status, setStatus] = useState<string>('')
  const list = trpc.leads.list.useQuery({
    status: (status || undefined) as any,
    limit: 200,
  })
  const [active, setActive] = useState<Lead | null>(null)

  return (
    <div className="sc-page">
      <div className="sc-page__head">
        <h1>פניות מהאתר</h1>
      </div>

      <Card className="mb-4">
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {['', 'new', 'contacted', 'qualified', 'converted', 'lost'].map(s => (
              <button
                key={s || 'all'}
                onClick={() => setStatus(s)}
                className={`px-3 py-1 rounded-sc-pill text-[12px] font-bold border ${
                  status === s
                    ? 'bg-sc-primary text-white border-sc-primary'
                    : 'bg-white text-sc-text border-sc-border'
                }`}
              >
                {s ? STATUS_LABEL[s] : 'הכל'}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="פניות" meta={<Pill kind="info">{list.data?.length ?? 0}</Pill>} />
        <CardBody>
          {list.isLoading ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">טוען…</div>
          ) : !list.data?.length ? (
            <div className="text-center py-6 text-sc-text-secondary text-[13px]">אין פניות</div>
          ) : (
            <div className="space-y-2">
              {list.data.map(l => (
                <button
                  key={l.id}
                  onClick={() => setActive(l)}
                  className="w-full text-right p-3 rounded-sc-input border border-sc-border bg-white hover:bg-sc-bg/60 transition-colors"
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <div className="font-semibold text-[14px]">{l.name}</div>
                    <div className="text-[12px] text-sc-text-secondary">{l.phone}</div>
                    <div className="flex-1" />
                    <Pill kind={SOURCE_PILL[l.source] ?? 'neutral'}>
                      {SOURCE_LABEL[l.source] ?? l.source}
                    </Pill>
                    <Pill kind={STATUS_PILL[l.status]}>{STATUS_LABEL[l.status]}</Pill>
                  </div>
                  {l.message && (
                    <div className="text-[12px] text-sc-text-secondary mt-1 line-clamp-2">
                      {l.message}
                    </div>
                  )}
                  <div className="text-[11px] text-sc-text-muted mt-1 flex flex-wrap gap-2">
                    <span>{new Date(l.created_at).toLocaleString('he-IL')}</span>
                    {l.city && <span>· {l.city}</span>}
                    {l.building_address && <span>· {l.building_address}</span>}
                    {l.email && <span>· {l.email}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {active && <LeadDetail lead={active} onClose={() => setActive(null)} />}
    </div>
  )
}

function LeadDetail({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const toast = useToast()
  const utils = trpc.useContext()
  const [status, setStatus] = useState(lead.status)
  const [notes, setNotes] = useState(lead.notes ?? '')

  const update = trpc.leads.update.useMutation({
    onSuccess: () => {
      toast.show('הפנייה עודכנה')
      void utils.leads.list.invalidate()
      onClose()
    },
    onError: e => toast.show(e.message),
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={`פנייה: ${lead.name}`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>
            סגור
          </Button>
          <Button
            loading={update.isLoading}
            onClick={() => update.mutate({ id: lead.id, status: status as any, notes })}
          >
            שמור
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-[13px]">
        <Row label="שם" value={lead.name} />
        <Row label="טלפון" value={<a href={`tel:${lead.phone}`}>{lead.phone}</a>} />
        {lead.email && (
          <Row label="אימייל" value={<a href={`mailto:${lead.email}`}>{lead.email}</a>} />
        )}
        {lead.city && <Row label="עיר" value={lead.city} />}
        {lead.building_address && <Row label="כתובת בניין" value={lead.building_address} />}
        {lead.message && (
          <Row label="הודעה" value={<div className="whitespace-pre-wrap">{lead.message}</div>} />
        )}
        <Row
          label="מקור"
          value={
            <Pill kind={SOURCE_PILL[lead.source] ?? 'neutral'}>
              {SOURCE_LABEL[lead.source] ?? lead.source}
            </Pill>
          }
        />
        <Row label="נוצר" value={new Date(lead.created_at).toLocaleString('he-IL')} />

        <div>
          <div className="text-sc-text-secondary mb-1">סטטוס</div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as any)}
            className="border border-sc-border rounded-sc-input p-2 w-full"
          >
            <option value="new">חדש</option>
            <option value="contacted">בטיפול</option>
            <option value="qualified">מתאים</option>
            <option value="converted">הומר</option>
            <option value="lost">נסגר</option>
          </select>
        </div>
        <div>
          <div className="text-sc-text-secondary mb-1">הערות</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
            className="border border-sc-border rounded-sc-input p-2 w-full"
            placeholder="הערות פנימיות..."
          />
        </div>
      </div>
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <div className="text-sc-text-secondary w-24 shrink-0">{label}</div>
      <div className="flex-1 break-words">{value}</div>
    </div>
  )
}
