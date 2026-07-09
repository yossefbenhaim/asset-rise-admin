// Self-contained HTML preview of a news article draft — replicates the
// customer site's /news/:slug design (Heebo RTL, navy/gold tokens, hero with
// overlay + logo chip, gold-accented section headers, sources block) so Yossef
// reviews EXACTLY what will ship, before anything is deployed.

export interface DraftArticle {
  slug: string
  title: string
  metaTitle?: string
  metaDescription?: string
  date: string
  lead: string
  heroImage?: string
  sections: Array<{
    h: string
    body?: string[]
    bullets?: string[]
    icon?: string
    image?: { src: string; alt: string; credit?: string }
  }>
  sources?: Array<{ name: string; url: string }>
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const fmtHe = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.valueOf())
    ? iso
    : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function buildArticlePreviewHtml(a: DraftArticle, heroB64?: string | null): string {
  const heroUrl = heroB64
    ? `data:image/jpeg;base64,${heroB64}`
    : a.heroImage
      ? `https://asset-rise.byclick.co.il${a.heroImage}`
      : null

  const sections = a.sections
    .map(
      s => `
    <section>
      <h2><span class="bar"></span>${esc(s.h)}${s.icon ? `<span class="icon-chip">${esc(s.icon)}</span>` : ''}</h2>
      ${(s.body ?? []).map(p => `<p>${esc(p)}</p>`).join('')}
      ${s.bullets ? `<ul>${s.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      ${
        s.image
          ? `<figure><img src="${esc(s.image.src)}" alt="${esc(s.image.alt)}"/>${s.image.credit ? `<figcaption>${esc(s.image.credit)}</figcaption>` : ''}</figure>`
          : ''
      }
    </section>`,
    )
    .join('')

  const sources = (a.sources ?? [])
    .map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`)
    .join(' · ')

  return `<!doctype html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap" rel="stylesheet"/>
<style>
  :root { --navy:#1e3a5f; --primary:#3b6b9c; --gold:#8b6f47; --cream:#f5f0e8; --border:#e5e0d5; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family:'Heebo',sans-serif; background:#faf8f4; color:var(--navy); }
  .hero { position:relative; color:#fff; text-align:center; padding:64px 24px;
    background:${heroUrl ? `linear-gradient(135deg, rgba(30,58,95,.86), rgba(59,107,156,.78)), url('${heroUrl}') center/cover` : 'linear-gradient(135deg, var(--navy), var(--primary))'}; }
  .hero .logo { position:absolute; top:12px; left:12px; background:rgba(255,255,255,.94);
    border-radius:10px; padding:5px 10px; line-height:0; }
  .hero .logo img { height:20px; }
  .hero .date { font-size:13px; opacity:.85; margin-bottom:12px; }
  .hero h1 { font-size:32px; font-weight:800; max-width:720px; margin:0 auto 14px; line-height:1.25; }
  .hero p { font-size:17px; max-width:600px; margin:0 auto; opacity:.92; line-height:1.6; }
  article { max-width:720px; margin:0 auto; padding:40px 24px; }
  h2 { display:flex; align-items:center; gap:10px; font-size:22px; font-weight:700; margin:36px 0 12px; }
  h2 .bar { width:4px; height:22px; background:var(--gold); border-radius:2px; flex-shrink:0; }
  h2 .icon-chip { font-size:10px; font-weight:700; color:var(--gold); border:1px solid var(--gold);
    border-radius:99px; padding:1px 8px; direction:ltr; }
  p { font-size:15.5px; line-height:1.8; margin:0 0 14px; }
  ul { margin:0 0 14px; padding-inline-start:20px; } li { line-height:1.7; margin-bottom:8px; }
  figure { margin:16px 0; } figure img { width:100%; border-radius:12px; }
  figcaption { font-size:11px; color:#8a8375; margin-top:6px; }
  .sources { font-size:13.5px; border-top:1px solid var(--border); padding-top:16px; margin-top:28px; }
  .sources a { color:var(--primary); }
  .cta { background:var(--cream); border:1px solid #d9c9a8; border-radius:12px; padding:22px;
    text-align:center; margin-top:28px; }
  .cta b { font-size:17px; } .cta p { font-size:13.5px; color:var(--primary); margin:6px 0 12px; }
  .cta .btn { display:inline-block; background:var(--gold); color:#fff; font-weight:700;
    padding:11px 24px; border-radius:10px; text-decoration:none; }
</style></head><body>
  <div class="hero">
    <span class="logo"><img src="https://asset-rise.byclick.co.il/brand/logo-text.png" alt="Asset Rise"/></span>
    <div class="date">${esc(fmtHe(a.date))}</div>
    <h1>${esc(a.title)}</h1>
    <p>${esc(a.lead)}</p>
  </div>
  <article>
    ${sections}
    ${sources ? `<div class="sources"><b>מקורות:</b> ${sources}</div>` : ''}
    <div class="cta"><b>רוצים לדעת מה שווה הבניין שלכם?</b>
      <p>בדיקת כדאיות פינוי בינוי חינמית — תוך שניות, לפי הכתובת.</p>
      <span class="btn">בדיקת כדאיות חינם</span></div>
  </article>
</body></html>`
}
