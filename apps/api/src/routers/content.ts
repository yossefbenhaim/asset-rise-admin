// Published-content monitor — what Parker (the reporter agent) has live on the
// customer site. Source of truth = the live sitemap.xml (generated at build
// time from seoContent.ts), so this is always what Google actually sees.
// Read-only, cached in-memory for 10 minutes.
import { router, requireAction } from '../trpc.js'

const SITE = 'https://asset-rise.byclick.co.il'
const TTL_MS = 10 * 60 * 1000

export interface PublishedItem {
  url: string
  path: string
  slug: string
  lastmod: string | null
}
export interface PublishedContent {
  news: PublishedItem[]
  cities: PublishedItem[]
  guides: PublishedItem[]
  fetchedAt: string
}

let cache: { at: number; data: PublishedContent } | null = null

async function fetchPublished(): Promise<PublishedContent> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data
  const res = await fetch(`${SITE}/sitemap.xml`, { signal: AbortSignal.timeout(10_000) })
  const xml = await res.text()
  const items: PublishedItem[] = []
  for (const m of xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)) {
    const url = m[1]
    const path = url.replace(SITE, '')
    items.push({ url, path, slug: path.split('/').pop() ?? '', lastmod: m[2] ?? null })
  }
  const data: PublishedContent = {
    news: items.filter(i => /^\/news\/./.test(i.path)),
    cities: items.filter(i => /^\/pinui-binui\/./.test(i.path)),
    guides: items.filter(i => /^\/guides\/./.test(i.path)),
    fetchedAt: new Date().toISOString(),
  }
  cache = { at: Date.now(), data }
  return data
}

export const contentRouter = router({
  published: requireAction('admin.dashboard').query(() => fetchPublished()),
})
