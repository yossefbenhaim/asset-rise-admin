// Per-agent model routing picker — which brain the agent runs on. Writing a
// choice creates a pending row in sc_agent_model_config; the host applier
// (cron, <1 min) updates agent-models.json and flips the row to 'applied'.
import { useState } from 'react'
import { Cpu, Check, Clock, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/api/trpc'
import { Pill } from '@/components/ui/Pill'

export interface ModelConfig {
  agent_id: string
  desired_model: string
  status: string
  error: string | null
  requested_at: string
  applied_at: string | null
}

const MODEL_OPTIONS = [
  { value: 'openai-codex/gpt-5.5', label: 'Codex · GPT-5.5', sub: 'מנוי Codex — ברירת המחדל' },
  { value: 'claude/sonnet', label: 'Claude · Sonnet', sub: 'מנוי Max — חכם ומהיר' },
  { value: 'claude/opus', label: 'Claude · Opus', sub: 'מנוי Max — החזק ביותר, כבד במכסה' },
  { value: 'claude/haiku', label: 'Claude · Haiku', sub: 'מנוי Max — קל וזול' },
] as const

type ModelValue = (typeof MODEL_OPTIONS)[number]['value']

export function ModelPicker({
  agentId,
  effectiveModel,
  config,
}: {
  agentId: string
  effectiveModel: string | null
  config: ModelConfig | null
}) {
  const utils = trpc.useUtils()
  const [selected, setSelected] = useState<ModelValue | null>(null)
  const setModel = trpc.agents.setModel.useMutation({
    onSettled: () => utils.agents.list.invalidate(),
  })

  const currentValue =
    selected ??
    (config?.desired_model as ModelValue) ??
    (effectiveModel as ModelValue) ??
    'openai-codex/gpt-5.5'
  const dirty = selected !== null && selected !== (config?.desired_model ?? effectiveModel)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Cpu size={13} className="text-sc-gold" />
        <select
          className="sc-input text-[12px] py-1.5 flex-1 min-w-[180px]"
          value={currentValue}
          onChange={e => setSelected(e.target.value as ModelValue)}
        >
          {MODEL_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label} — {o.sub}
            </option>
          ))}
        </select>
        <button
          onClick={() => selected && setModel.mutate({ agentId, model: selected })}
          disabled={!dirty || setModel.isPending}
          className="sc-btn-primary text-[12px] py-1.5 px-3 disabled:opacity-40"
        >
          {setModel.isPending ? 'שולח…' : 'החל מודל'}
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {config?.status === 'pending' && (
          <Pill kind="warning">
            <Clock size={10} /> ממתין להחלה (עד דקה) → {config.desired_model}
          </Pill>
        )}
        {config?.status === 'applied' && (
          <Pill kind="success">
            <Check size={10} /> פעיל: {config.desired_model}
          </Pill>
        )}
        {config?.status === 'error' && (
          <Pill kind="danger">
            <AlertTriangle size={10} /> שגיאה: {config.error ?? 'לא ידועה'}
          </Pill>
        )}
        {!config && effectiveModel && (
          <span className="text-[11px] text-sc-text-muted" dir="ltr">
            {effectiveModel}
          </span>
        )}
        {setModel.isError && (
          <span className="text-[11px] text-sc-danger">שמירת המודל נכשלה — נסה שוב</span>
        )}
      </div>
    </div>
  )
}
