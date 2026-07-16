// Tidy renderer for agent-written text (briefs, questions, answers, notes).
// Agents sometimes emit literal "\n" sequences (bash heredocs), markdown-ish
// headings and numbered lists — normalize and give it real typography instead
// of dumping a wall of text.
const normalize = (s: string) => s.replace(/\\n/g, '\n').replace(/\r/g, '')

function classify(line: string): 'heading' | 'bullet' | 'empty' | 'text' {
  const t = line.trim()
  if (!t) return 'empty'
  if (
    /^#{1,4}\s/.test(t) ||
    /^\*\*.+\*\*:?$/.test(t) ||
    (/^.{2,60}:$/.test(t) && !/\d{2}:\d{2}/.test(t))
  )
    return 'heading'
  if (/^([-*•]|\d{1,2}[.)])\s/.test(t)) return 'bullet'
  return 'text'
}

const strip = (t: string) =>
  t
    .replace(/^#{1,4}\s*/, '')
    .replace(/^\*\*(.+?)\*\*:?$/, '$1')
    .replace(/\*\*/g, '')

export function Formatted({ text, className = '' }: { text: string; className?: string }) {
  const lines = normalize(text).split('\n')
  return (
    <div className={`text-[12.5px] leading-relaxed ${className}`}>
      {lines.map((line, i) => {
        const kind = classify(line)
        if (kind === 'empty') return <div key={i} className="h-2" />
        if (kind === 'heading')
          return (
            <div key={i} className="font-bold text-sc-text mt-2 mb-0.5">
              {strip(line.trim())}
            </div>
          )
        if (kind === 'bullet')
          return (
            <div key={i} className="flex gap-1.5 ps-1">
              <span className="text-sc-primary shrink-0 mt-[1px]">•</span>
              <span>{line.trim().replace(/^([-*•]|\d{1,2}[.)])\s*/, '')}</span>
            </div>
          )
        return <div key={i}>{line.replace(/\*\*/g, '')}</div>
      })}
    </div>
  )
}
