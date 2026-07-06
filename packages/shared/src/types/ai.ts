// AI Analyst Control — admin Control Center types + Zod inputs.
// Backs apps/api/src/routers/ai.ts and apps/web/src/features/ai/*.
//
// The analyzer's AI lives in sc_analyzer_jobs: each job has a `request` (the
// research input), a `result` jsonb (the structured AiResearch the Codex
// `analyzer` agent wrote back — summary_he / opinion_he / perspectives / …),
// and a `research_key` whose leading segment is the RESEARCH_VERSION (e.g.
// "v10::haifa::g:1234"). Admin reads a handful of fields defensively without
// depending on the customer app's full AiResearch shape.
import { z } from 'zod'

// Pipeline status for an AI job, mapped to our badge vocabulary. Jobs use
// 'done'; we keep it alongside the report-style words the StatusBadge knows.
export type AiJobStatus = 'pending' | 'running' | 'done' | 'failed'

// One row in the AI summaries table — flattened for DataTable + CSV. `type`
// (not interface) so it satisfies the DataTable generic constraint
// `T extends Record<string, unknown>`.
export type AiSummaryRow = {
  research_key: string
  status: AiJobStatus
  version: string | null // RESEARCH_VERSION from the research_key prefix
  model: string | null // from request/result if present, else null
  heading: string | null // best-effort headline (summary_he)
  summary: string | null // longer text (opinion_he / summary_he)
  confidence: string | null // high / medium / low (if present)
  has_perspectives: boolean // 3-hat AI panel present
  attempts: number | null
  created_at: string
  updated_at: string | null
  completed_at: string | null
  error: string | null
}

// Full detail returned by ai.get(research_key) — the row + the raw jsonb blobs
// so the drawer can render the whole structured result.
export interface AiSummaryDetail {
  research_key: string
  status: AiJobStatus
  version: string | null
  model: string | null
  heading: string | null
  summary: string | null
  confidence: string | null
  has_perspectives: boolean
  attempts: number | null
  created_at: string
  updated_at: string | null
  completed_at: string | null
  error: string | null
  // 3-hat panel, surfaced for nice rendering when present.
  perspectives: AiPerspective[]
  recommendations: string[]
  sources: string[]
  // The raw blobs (rendered as collapsible JSON in the drawer).
  request: unknown
  result: unknown
}

export interface AiPerspective {
  role: 'appraiser' | 'architect' | 'developer' | string
  rating: number | null
  stance: 'positive' | 'neutral' | 'cautious' | string | null
  opinion_he: string | null
  key_point_he: string | null
}

// Which AI agent a prompt belongs to. Analyzer = the deterministic-research
// host worker; Wong = the document-verification host worker.
export type AiAgent = 'analyzer' | 'wong'

// One known version in the prompt-version history. `current` marks the version
// the live worker is on. `prompt` is the stored editable OVERRIDE text for that
// version (null when nothing has been stored yet in sc_ai_prompts).
export interface AiPromptVersion {
  version: string // 'v1' … 'v10'
  current: boolean
  note: string | null // human note about what changed in this version
  prompt: string | null // editable override text (sc_ai_prompts), if stored
  hasOverride: boolean // convenience flag (prompt != null)
  base_note: string // read-only note of the engine base prompt
  updated_by: string | null // admin id that last edited the override
  updated_at: string | null // when the stored override was last edited
}

export interface AiPromptVersionsResult {
  agent: AiAgent
  current: string // the live version for this agent
  versions: AiPromptVersion[]
  // The ACTUAL base prompt the host worker runs right now (static instruction
  // text with {placeholders} where per-request data is injected). Shown
  // read-only so it's clear exactly what the agent is running on.
  basePrompt: string
  // Where edits go + how the worker consumes them (shown in the panel).
  note: string
}

// ── Inputs ─────────────────────────────────────────────────────────────
export const AiResearchKeyInput = z.object({
  research_key: z.string().min(1).max(300),
})
export type AiResearchKeyInput = z.infer<typeof AiResearchKeyInput>

// Re-run: set the matching job back to 'pending' so the host worker re-runs it.
export const AiRegenerateInput = z.object({
  research_key: z.string().min(1).max(300),
})
export type AiRegenerateInput = z.infer<typeof AiRegenerateInput>

// Agent selector — shared by promptVersions + editPrompt.
export const AiAgentInput = z.enum(['analyzer', 'wong'])

// List a single agent's prompt versions.
export const AiPromptVersionsInput = z.object({
  agent: AiAgentInput,
})
export type AiPromptVersionsInput = z.infer<typeof AiPromptVersionsInput>

// Edit a version's prompt text → upserted into sc_ai_prompts (the host worker
// reads this store). agent + version like ('analyzer','v10'); text is the full
// prompt body.
export const AiEditPromptInput = z.object({
  agent: AiAgentInput,
  version: z
    .string()
    .min(1)
    .max(20)
    .regex(/^v\d{1,3}$/, 'גרסה חייבת להיות בפורמט v<מספר>'),
  text: z.string().max(20000),
  note: z.string().max(500).nullable().optional(),
})
export type AiEditPromptInput = z.infer<typeof AiEditPromptInput>
