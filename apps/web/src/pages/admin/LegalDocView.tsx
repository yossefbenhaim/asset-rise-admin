// Branded A4 viewer for Matt Murdock's legal documents. Renders the doc's
// Markdown as a professional, RTL, Asset-Rise-branded A4 page, previewed
// inline in an <iframe> and exported to a vector PDF via the browser's
// Save-as-PDF (A4). Two modes, toggled in the modal:
//   'publish' — clean official Asset Rise document: draft headers stripped,
//               no signature block, "מסמך רשמי" footer. Ready to upload as-is.
//   'draft'   — the lawyer-review version with the signature block.
import { useMemo, useState } from 'react'
import { marked } from 'marked'
import { Download, FileSignature, Globe } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

export type DocMode = 'publish' | 'draft'

const LOGO_URL = 'https://asset-rise.byclick.co.il/brand/logo-text.png'
const NAVY = '#1e3a5f'
const GOLD = '#a6895f'

function todayHe(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

// Publish-mode cleaner: removes every draft marker Murdock puts in his docs —
// the "טיוטה" headings/blockquotes, status/date-of-draft lines, table rows and
// lawyer-handoff instructions — and rephrases draft-speak ("טיוטה זו") into
// document-speak ("מסמך זה"), so the published version reads as a final
// official Asset Rise document. The source files stay untouched.
function stripDraftHeader(src: string): string {
  const lines = src.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    let l = lines[i]
    const ls = l.trim()
    if (/^#{1,3}\s*טיוטה/.test(ls)) {
      i++
      continue
    }
    if (ls.startsWith('>')) {
      let j = i
      let block = ''
      while (j < lines.length && lines[j].trim().startsWith('>')) {
        block += lines[j] + ' '
        j++
      }
      if (block.includes('טיוטה')) {
        i = j
        continue
      }
    }
    if (ls.startsWith('|') && ls.includes('טיוטה')) {
      i++
      continue
    }
    if (/^[-*]?\s*(תאריך|סטטוס)\s+ה?טיוטה/.test(ls)) {
      i++
      continue
    }
    if (ls.includes('סטטוס השורה לצורכי הטיוטה') || ls.includes('סטטוס הטיוטה')) {
      i++
      continue
    }
    if (ls.includes('טיוטה') && /(לבדיקת|למסירה|מוכנה? ל|ממתין)/.test(ls) && ls.includes('עו')) {
      i++
      continue
    }
    if (/^\*{0,2}מסמך זה (הוא|הינו) טיוטה/.test(ls)) {
      while (i < lines.length && lines[i].trim() !== '') i++
      continue
    }
    l = l
      .replace(/לצורך הכנת טיוטה זו/g, 'לצורך הכנת מסמך זה')
      .replace(/במסגרת הכנת טיוטה זו/g, 'במסגרת הכנת מסמך זה')
      .replace(/נכון לטיוטה זו/g, 'נכון למועד העדכון')
      .replace(/לטיוטה זו/g, 'למסמך זה')
      .replace(/טיוטה זו/g, 'מסמך זה')
      .replace(/לצורך הטיוטה/g, 'לצורך המסמך')
      .replace(/, ברמת טיוטה,/g, ',')
      .replace(/כטיוטה פנימית/g, 'כמסמך פנימי')
    out.push(l)
    i++
  }
  return out.join('\n')
}

// Build one self-contained, print-ready A4 HTML document (RTL Hebrew).
export function buildLegalHtml(
  title: string,
  markdownSrc: string,
  mode: DocMode = 'draft',
): string {
  const source = mode === 'publish' ? stripDraftHeader(markdownSrc ?? '') : (markdownSrc ?? '')
  const body = marked.parse(source, { async: false }) as string
  const safeTitle = title.replace(/\.md$/i, '').replace(/[<>]/g, '')
  const metaLine =
    mode === 'publish'
      ? `Asset Rise · התחדשות עירונית<br>מסמך רשמי · עודכן ${todayHe()}`
      : `Asset Rise · התחדשות עירונית<br>מסמך משפטי · הופק ${todayHe()}`
  const hint =
    mode === 'publish'
      ? 'גיליון A4 · גרסת פרסום רשמית של Asset Rise (בחר/י "שמירה כ־PDF" ביעד ההדפסה)'
      : 'גיליון A4 · ממותג · מוכן לחתימת עו״ד (בחר/י "שמירה כ־PDF" ביעד ההדפסה)'
  const sigblock =
    mode === 'publish'
      ? ''
      : `
    <div class="sigblock">
      <h4>אישור וחתימת עורך דין</h4>
      <div class="sub">מסמך זה הוא טיוטה. הוא טעון בדיקה, אישור וחתימה של עו״ד מוסמך בטרם ייעשה בו שימוש.</div>
      <div class="sigrow">
        <div class="cell"><div class="sigline"></div>שם עורך/ת הדין</div>
        <div class="cell"><div class="sigline"></div>מס׳ רישיון</div>
        <div class="cell"><div class="sigline"></div>תאריך</div>
        <div class="cell" style="max-width:120px"><div class="sigline"></div>חתימה</div>
        <div class="stamp">חותמת</div>
      </div>
    </div>`
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&family=Frank+Ruhl+Libre:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root{ --navy:${NAVY}; --gold:${GOLD}; --ink:#1a1a1a; --muted:#666 }
  *{ box-sizing:border-box }
  html,body{ margin:0; padding:0; background:#e9edf1 }
  body{ font-family:'Heebo',Arial,sans-serif; color:var(--ink); line-height:1.7; font-size:12pt }
  /* On screen: show as a centered A4 sheet with a shadow. */
  .page{ background:#fff; width:210mm; min-height:297mm; margin:16px auto; padding:18mm 18mm 24mm;
         box-shadow:0 6px 30px rgba(0,0,0,.18); position:relative }
  .brandhdr{ display:flex; align-items:center; justify-content:space-between; gap:12px;
             border-bottom:3px solid var(--gold); padding-bottom:12px; margin-bottom:8px }
  .brandhdr img{ height:42px }
  .brandhdr .fallback{ font-weight:800; font-size:20pt; color:var(--navy); letter-spacing:.5px }
  .brandhdr .meta{ text-align:left; font-size:9.5pt; color:var(--muted); line-height:1.5 }
  h1{ color:var(--navy); font-family:'Frank Ruhl Libre','Heebo',serif; font-size:19pt; margin:14px 0 4px }
  h2{ color:var(--navy); font-size:14.5pt; margin:18px 0 6px; border-bottom:1px solid #e2e8f0; padding-bottom:3px }
  h3{ color:#2a4a70; font-size:12.5pt; margin:14px 0 4px }
  p{ margin:0 0 9px; text-align:justify }
  ul,ol{ margin:0 0 10px; padding-inline-start:22px }
  li{ margin-bottom:4px }
  strong{ color:#111 }
  a{ color:var(--navy); text-decoration:none }
  code{ font-family:'Courier New',monospace; background:#f3f5f8; padding:1px 5px; border-radius:4px; font-size:10.5pt; direction:ltr; display:inline-block }
  pre{ background:#f6f8fa; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; overflow:auto; direction:ltr; text-align:left; font-size:10pt }
  blockquote{ margin:10px 0; padding:10px 14px; background:#fbf7ef; border-inline-start:4px solid var(--gold);
              border-radius:6px; color:#5a4a2f; font-weight:600 }
  table{ width:100%; border-collapse:collapse; margin:10px 0; font-size:10.5pt }
  th,td{ border:1px solid #cdd6e0; padding:6px 9px; text-align:right; vertical-align:top }
  th{ background:var(--navy); color:#fff; font-weight:700 }
  tr:nth-child(even) td{ background:#f6f8fa }
  hr{ border:0; border-top:1px solid #e2e8f0; margin:16px 0 }
  .sigblock{ margin-top:26px; border:1.5px solid var(--navy); border-radius:10px; padding:16px 18px; background:#fcfdff }
  .sigblock h4{ margin:0 0 4px; color:var(--navy); font-size:12pt }
  .sigblock .sub{ font-size:9.5pt; color:var(--muted); margin-bottom:14px }
  .sigrow{ display:flex; gap:22px; flex-wrap:wrap; font-size:10.5pt }
  .sigrow .cell{ flex:1; min-width:150px }
  .sigline{ border-bottom:1px solid #333; height:26px; margin-bottom:4px }
  .stamp{ width:96px; height:96px; border:1.5px dashed #b7c1cd; border-radius:50%; display:flex; align-items:center;
          justify-content:center; color:#9aa7b4; font-size:9pt; text-align:center }
  .foot{ position:absolute; bottom:10mm; inset-inline:18mm; border-top:1px solid #e2e8f0; padding-top:6px;
         font-size:8.5pt; color:#9aa7b4; display:flex; justify-content:space-between }
  .toolbar{ position:sticky; top:0; background:#0f1b2d; color:#fff; padding:10px 16px; display:flex; gap:10px;
            align-items:center; font-family:'Heebo',sans-serif; z-index:5 }
  .toolbar button{ background:var(--gold); color:#fff; border:0; border-radius:8px; padding:8px 16px; font-weight:800;
                   cursor:pointer; font-size:13px }
  .toolbar .hint{ font-size:12px; color:#b9c4d2 }
  @media print{
    html,body{ background:#fff }
    .toolbar{ display:none !important }
    .page{ width:auto; min-height:auto; margin:0; padding:0; box-shadow:none }
    .foot{ position:fixed }
    @page{ size:A4; margin:16mm }
    h2,h3{ break-after:avoid }
    table,blockquote,.sigblock{ break-inside:avoid }
  }
</style></head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">הורד / שמור כ־PDF</button>
    <span class="hint">${hint}</span>
  </div>
  <div class="page">
    <div class="brandhdr">
      <img src="${LOGO_URL}" alt="Asset Rise" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <span class="fallback" style="display:none">Asset Rise</span>
      <div class="meta">${metaLine}</div>
    </div>
    ${body}${sigblock}
    <div class="foot"><span>Asset Rise · asset-rise.byclick.co.il</span><span>${safeTitle}</span></div>
  </div>
</body></html>`
}

export function LegalDocView({
  title,
  content,
  loading,
  onClose,
}: {
  title: string
  content: string | null
  loading: boolean
  onClose: () => void
}) {
  const [mode, setMode] = useState<DocMode>('publish')
  const html = useMemo(
    () => (content ? buildLegalHtml(title, content, mode) : ''),
    [title, content, mode],
  )

  const download = () => {
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
    // Give fonts/logo a beat to load before the print dialog.
    w.setTimeout(() => w.print(), 700)
  }

  const modeBtn = (m: DocMode, label: string, Icon: typeof Globe) => (
    <button
      onClick={() => setMode(m)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold border transition-colors ${
        mode === m
          ? 'bg-sc-navy text-white border-sc-navy'
          : 'bg-transparent text-sc-text-secondary border-sc-border hover:border-sc-navy'
      }`}
    >
      <Icon size={13} /> {label}
    </button>
  )

  return (
    <Modal
      open
      onClose={onClose}
      title={title.replace(/\.md$/i, '')}
      subtitle={
        mode === 'publish'
          ? 'גרסת פרסום — מסמך רשמי של Asset Rise, מוכן להעלאה כמו שהוא'
          : 'גרסת עו״ד — כולל בלוק חתימה לבדיקה משפטית'
      }
      size="xl"
      icon={<FileSignature size={18} />}
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {modeBtn('publish', 'גרסת פרסום', Globe)}
            {modeBtn('draft', 'גרסת עו״ד', FileSignature)}
          </div>
          <Button onClick={download} disabled={!content}>
            <Download size={15} /> הורד PDF
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="text-[13px] text-sc-text-secondary p-4">טוען…</div>
      ) : content ? (
        <iframe
          title={title}
          srcDoc={html}
          className="w-full rounded-lg border border-sc-border bg-white"
          style={{ height: '68vh' }}
        />
      ) : (
        <div className="text-[13px] text-sc-text-secondary p-4">אין תוכן להצגה.</div>
      )}
    </Modal>
  )
}
