// Self-contained HTML preview of a news article draft — replicates the three
// premium layouts of the customer site (classic/magazine/dynamic, per the
// approved sketches) so Yossef reviews EXACTLY what will ship: crisp hero with
// the small brand-mark pill, kicker, key-points, stat pullouts, pull quote.

export interface DraftArticle {
  slug: string
  title: string
  date: string
  lead: string
  heroImage?: string
  layout?: 'classic' | 'magazine' | 'dynamic'
  kicker?: string
  readMinutes?: number
  heroCaption?: string
  keyPoints?: string[]
  stats?: Array<{ value: string; label: string }>
  quote?: { text: string; who: string }
  sections: Array<{
    h: string
    body?: string[]
    bullets?: string[]
    icon?: string
    image?: { src: string; alt: string; credit?: string }
  }>
  sources?: Array<{ name: string; url: string }>
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const fmtHe = (iso: string) => {
  const d = new Date(iso + 'T00:00:00')
  return Number.isNaN(d.valueOf())
    ? iso
    : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
}

const ICON_URL = 'https://asset-rise.byclick.co.il/brand/icon-gold.png'

const CSS = `
  * { box-sizing:border-box; margin:0; }
  :root { --navy:#1e3a5f; --primary:#3b6b9c; --gold:#8b6f47; --gold-l:#c9a86a; --cream:#f5f0e8; --gray:#6b7280; --border:#e8e3d8; }
  body { font-family:'Heebo',sans-serif; background:#fff; color:#1a2332; }
  .wrap { max-width:760px; margin:0 auto; padding:0 22px; }
  p { font-size:17px; line-height:1.85; margin:0 0 18px; color:#2a3442; }
  p b { color:var(--navy); }
  ul { margin:0 0 16px; padding-inline-start:20px; } li { line-height:1.7; margin-bottom:7px; }
  .caption { font-size:12.5px; color:var(--gray); padding:8px 2px 0; }
  .imgbox { position:relative; } .imgbox img.hero { width:100%; display:block; }
  .brandmark { position:absolute; top:12px; inset-inline-end:12px; display:flex; align-items:center; gap:7px;
    background:rgba(20,28,40,.55); backdrop-filter:blur(4px); border-radius:99px; padding:5px 12px 5px 8px; }
  .brandmark img { height:20px; } .brandmark span { color:#fff; font-size:12.5px; font-weight:700; }
  .keypoints { background:var(--cream); border-inline-start:4px solid var(--gold); border-radius:10px; padding:20px 22px; margin:26px 0; }
  .keypoints h3 { font-size:15px; font-weight:800; color:var(--gold); margin-bottom:10px; }
  .keypoints li { font-size:15.5px; color:var(--navy); font-weight:500; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin:26px 0; }
  .stat { background:#fff; border:1px solid var(--border); border-top:3px solid var(--gold); border-radius:10px; padding:14px 10px; text-align:center; }
  .stat b { display:block; font-size:24px; font-weight:900; color:var(--navy); }
  .stat span { font-size:12px; color:var(--gray); line-height:1.45; display:block; margin-top:4px; }
  .band { background:var(--navy); border-radius:14px; color:#fff; display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:6px; padding:18px 12px; margin:26px 0; }
  .band .stat { background:transparent; border:0; } .band b { color:var(--gold-l); } .band span { color:rgba(255,255,255,.85); }
  .pull { border-top:3px solid var(--gold); border-bottom:1px solid var(--border); padding:22px 8px; margin:30px 0; text-align:center; }
  .pull .q { font-size:23px; font-weight:800; line-height:1.5; color:var(--navy); }
  .pull .who { font-size:13px; color:var(--gold); font-weight:700; margin-top:8px; }
  .pull--card { border:1px solid var(--border); border-inline-start:5px solid var(--gold); border-radius:12px; padding:20px 24px; text-align:right; box-shadow:0 4px 14px rgba(16,24,38,.05); }
  .pull--card .q { font-size:20px; font-weight:700; }
  .h2c { display:flex; align-items:center; gap:10px; font-size:24px; font-weight:800; color:var(--navy); margin:34px 0 12px; }
  .h2c .dot { width:10px; height:10px; border-radius:3px; background:var(--gold); flex-shrink:0; }
  .numh { display:flex; align-items:center; gap:12px; margin:36px 0 12px; }
  .numh .n { width:34px; height:34px; border-radius:10px; background:var(--navy); color:var(--gold-l); font-weight:900; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .numh h2 { font-size:23px; font-weight:800; color:var(--navy); }
  .pillh { display:inline-flex; align-items:center; gap:9px; background:var(--cream); border:1px solid #e2d7bf; border-radius:99px; padding:7px 18px; margin:30px 0 12px; }
  .pillh h2 { font-size:19px; font-weight:800; color:var(--navy); }
  .sources { font-size:13.5px; color:var(--gray); border-top:1px solid var(--border); padding:16px 0; margin-top:30px; }
  .sources a { color:var(--primary); }
  figure { margin:16px 0; } figure img { width:100%; border-radius:12px; }
  figcaption { font-size:11px; color:var(--gray); margin-top:6px; }
  /* classic top */
  .kicker { display:inline-flex; align-items:center; gap:8px; margin:34px 0 14px; }
  .kicker .lbl { background:var(--gold); color:#fff; font-size:13px; font-weight:800; padding:4px 14px; border-radius:4px; }
  .kicker .cat { color:var(--gold); font-size:13.5px; font-weight:700; }
  h1.classic { font-size:40px; font-weight:900; line-height:1.22; color:var(--navy); margin-bottom:14px; }
  .sub { font-size:19px; line-height:1.6; color:#4a5568; margin-bottom:18px; }
  .byline { display:flex; align-items:center; gap:10px; font-size:13.5px; color:var(--gray); border-block:1px solid var(--border); padding:10px 0; margin-bottom:20px; }
  .byline .avatar { width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg,var(--navy),var(--primary)); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:13px; }
  .byline b { color:#1a2332; }
  /* magazine top */
  .herofull { position:relative; height:480px; overflow:hidden; }
  .herofull img.hero { width:100%; height:100%; object-fit:cover; }
  .scrim { position:absolute; inset-inline:0; bottom:0; padding:90px 26px 26px;
    background:linear-gradient(to top, rgba(16,24,38,.92), rgba(16,24,38,.55) 55%, transparent); color:#fff; }
  .scrim .inner { max-width:760px; margin:0 auto; }
  .kick { display:inline-block; background:var(--gold); color:#fff; font-size:12.5px; font-weight:800; padding:4px 14px; border-radius:99px; margin-bottom:12px; }
  .scrim h1 { font-size:36px; font-weight:900; line-height:1.25; text-shadow:0 2px 14px rgba(0,0,0,.4); }
  .scrim .meta { font-size:13px; opacity:.85; margin-top:10px; }
  .subbar { background:var(--cream); border-bottom:1px solid var(--border); }
  .subbar .inner { max-width:760px; margin:0 auto; padding:18px 22px; font-size:18px; line-height:1.65; color:var(--navy); font-weight:500; }
  /* dynamic top */
  .top { background:var(--navy); padding:26px 22px 90px; }
  .top .inner { max-width:880px; margin:0 auto; }
  .top .kickflat { color:var(--gold-l); font-size:13.5px; font-weight:800; }
  .top h1 { color:#fff; font-size:34px; font-weight:900; line-height:1.28; margin:10px 0 12px; max-width:700px; }
  .top .meta { color:rgba(255,255,255,.75); font-size:13px; }
  .herocard { max-width:880px; margin:-64px auto 0; padding:0 22px; }
  .herocard .imgbox { border-radius:16px; overflow:hidden; box-shadow:0 18px 44px rgba(16,24,38,.22); }
  .subcard { max-width:760px; margin:14px auto 0; background:#fff; border:1px solid var(--border); border-radius:14px;
    padding:20px 24px; font-size:18px; line-height:1.65; color:var(--navy); font-weight:500; box-shadow:0 8px 24px rgba(16,24,38,.08); }
`

export function buildArticlePreviewHtml(a: DraftArticle, heroB64?: string | null): string {
  const layout = a.layout ?? 'classic'
  const heroUrl = heroB64
    ? `data:image/jpeg;base64,${heroB64}`
    : a.heroImage
      ? `https://asset-rise.byclick.co.il${a.heroImage}`
      : null

  const brandmark = `<span class="brandmark"><img src="${ICON_URL}"/><span>Asset Rise</span></span>`
  const heroBox = heroUrl
    ? `<div class="imgbox"><img class="hero" src="${heroUrl}"/>${brandmark}</div>${a.heroCaption ? `<div class="caption">${esc(a.heroCaption)}</div>` : ''}`
    : ''
  const meta = `מערכת Asset Rise · ${esc(fmtHe(a.date))}${a.readMinutes ? ` · קריאה של ${a.readMinutes} דקות` : ''}`

  const top =
    layout === 'magazine'
      ? `<div class="herofull">${heroUrl ? `<img class="hero" src="${heroUrl}"/>` : ''}${brandmark}
          <div class="scrim"><div class="inner"><span class="kick">${esc(a.kicker ?? 'חדשות')}</span>
          <h1>${esc(a.title)}</h1><div class="meta">${meta}</div></div></div></div>
        <div class="subbar"><div class="inner">${esc(a.lead)}</div></div>`
      : layout === 'dynamic'
        ? `<div class="top"><div class="inner"><span class="kickflat">חדשות · ${esc(a.kicker ?? 'התחדשות עירונית')}</span>
            <h1>${esc(a.title)}</h1><div class="meta">${meta}</div></div></div>
          <div class="herocard">${heroBox}</div>
          <div class="wrap"><div class="subcard">${esc(a.lead)}</div></div>`
        : `<div class="wrap">
            <div class="kicker"><span class="lbl">חדשות</span><span class="cat">${esc(a.kicker ?? 'התחדשות עירונית')}</span></div>
            <h1 class="classic">${esc(a.title)}</h1><div class="sub">${esc(a.lead)}</div>
            <div class="byline"><span class="avatar">AR</span><span><b>מערכת Asset Rise</b> · ${esc(fmtHe(a.date))}${a.readMinutes ? ` · קריאה של ${a.readMinutes} דקות` : ''}</span></div>
            ${heroBox}</div>`

  const keypoints = a.keyPoints?.length
    ? `<div class="keypoints"><h3>עיקרי הדברים</h3><ul>${a.keyPoints.map(k => `<li>${esc(k)}</li>`).join('')}</ul></div>`
    : ''
  const stats = a.stats?.length
    ? `<div class="${layout === 'dynamic' ? 'band' : 'stats'}">${a.stats.map(s => `<div class="stat"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>`
    : ''
  const quote = a.quote
    ? `<div class="pull ${layout === 'dynamic' ? 'pull--card' : ''}"><div class="q">"${esc(a.quote.text)}"</div><div class="who">${esc(a.quote.who)}</div></div>`
    : ''

  const sec = (s: DraftArticle['sections'][number], i: number) => {
    const header =
      layout === 'magazine'
        ? `<div class="numh"><span class="n">${i + 1}</span><h2>${esc(s.h)}</h2></div>`
        : layout === 'dynamic'
          ? `<div class="pillh"><h2>${esc(s.h)}</h2></div>`
          : `<div class="h2c"><span class="dot"></span>${esc(s.h)}</div>`
    return `<section>${header}
      ${(s.body ?? []).map(p => `<p>${esc(p)}</p>`).join('')}
      ${s.bullets ? `<ul>${s.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
      ${s.image ? `<figure><img src="${esc(s.image.src)}" alt="${esc(s.image.alt)}"/>${s.image.credit ? `<figcaption>${esc(s.image.credit)}</figcaption>` : ''}</figure>` : ''}
    </section>`
  }
  const half = Math.ceil(a.sections.length / 2)
  const body = `${keypoints}
    ${a.sections.slice(0, half).map(sec).join('')}
    ${stats}${quote}
    ${a.sections
      .slice(half)
      .map((s, i) => sec(s, half + i))
      .join('')}`

  const sources = (a.sources ?? [])
    .map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`)
    .join(' · ')

  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&display=swap" rel="stylesheet"/>
<style>${CSS}</style></head><body>
${top}
<article class="wrap" style="padding-top:22px">
${body}
${sources ? `<div class="sources"><b>מקורות:</b> ${sources}</div>` : ''}
</article></body></html>`
}
