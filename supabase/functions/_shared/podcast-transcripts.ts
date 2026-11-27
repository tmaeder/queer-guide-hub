import { decodeHtmlEntities, stripHtmlTags } from './news-quality/sanitize.ts'
import { assertPublicHttpUrl } from './ssrf-guard.ts'

export interface PodcastTranscriptLink {
  url: string
  scope: 'episode' | 'show'
  source: 'feed' | 'show_notes'
  type?: string
  language?: string
}

export function transcriptUrl(value: unknown, base?: string): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = assertPublicHttpUrl(new URL(decodeHtmlEntities(value).trim(), base).href)
    if (url.username || url.password || !url.hostname.includes('.')) return null
    // Flattened markup can concatenate a sound-credit URL with "Transcript:"
    // or even another URL. These are not transcript destinations.
    if (/https?:|transcript:/i.test(url.pathname)
      || /\/transcript\/(?:new|edit)(?:\/|$)/i.test(url.pathname)) return null
    if (/(^|\.)freesound\.org$/i.test(url.hostname) && /\/people\/[^/]+\/sounds\//i.test(url.pathname)) return null
    // Publisher-confirmed moves, checked against their current transcript pages.
    if (/(^|\.)howitendspodcast\.com$/i.test(url.hostname)
      && url.pathname.replace(/\/$/, '') === '/how-it-ends-podcast-transcripts') return 'https://howitendsstudio.com/transcripts'
    if (/(^|\.)thelogbooks\.org$/i.test(url.hostname) && /^\/transcripts?(?:\/|$)/i.test(url.pathname)) return 'https://auntnell.com/projects/the-log-books/'
    if (url.hostname === 'www.soundsfakepod.com' && url.pathname === '/transcripts/would') return 'https://www.soundsfakepod.com/transcripts/would-you-rather-aspec-edition'
    // Current destinations are linked by the publisher's Axe & Crown S2 index:
    // https://albasalix.com/axe-and-crown/axe-s2/
    const albaMoves: Record<string, string> = {
      '/episodes/axe-crown-e201-a-taste-of-something-new/': '/episodes/e201-a-taste-of-something-new/',
      '/episodes/axe-crown-e202-cutting-edge/': '/episodes/axe-and-crown/e202-the-cutting-edge/',
      '/episodes/axe-crown-e203-worth-celebrating/': '/episodes/e203-worth-celebrating/',
      '/episodes/axe-crown-e204-as-good-as-gone/': '/episodes/e204-as-good-as-gone/',
      '/episodes/axe-crown-e205-off-and-running/': '/episodes/e205-off-and-running/',
      '/episodes/axe-crown-e206-back-room-deals/': '/episodes/e206-back-room-deals/',
      '/episodes/axe-crown-bonus-a-dangerous-cocktail/': '/episodes/bonus-a-dangerous-cocktail/',
      '/episodes/bonus-axe-crown-s2-drubbin-drops-in/': '/episodes/bonus-episode-the-axe-crown-s2-drubbin-drops-in-2/',
    }
    if (url.hostname === 'albasalix.com' && albaMoves[url.pathname]) return 'https://albasalix.com' + albaMoves[url.pathname]
    return url.href
  } catch { return null }
}

const transcriptWord = /\btranscripts?\b|transkripte?|transcripci[oó]n|transcri[cç][aã]o/i
const formats = /^(?:text\/(?:plain|html|vtt)|application\/(?:json|x-subrip|srt|pdf))$/

function archive(url: string): boolean {
  const u = new URL(url)
  return /(?:^\/(?:podcast\/)?transcripts?|\/episodes|\/[^/]*[-_]transcripts)$/i.test(u.pathname.replace(/\/+$/, ''))
    || u.href === 'https://auntnell.com/projects/the-log-books/'
    || /\/transcripts\/the-magnus-(?:archives|protocol)\/?$/i.test(u.pathname)
}

export function transcriptMatchesEpisode(url: string, ...episodeUrls: (string | undefined)[]): boolean {
  const buzzsproutId = (raw?: string) => {
    if (!raw) return null
    try {
      const u = new URL(raw)
      return /(^|\.)buzzsprout\.com$/i.test(u.hostname)
        ? u.pathname.match(/^\/(\d+)\/(?:episodes\/)?(\d+)(?:[-/.]|$)/)?.slice(1).join('/') ?? null : null
    } catch { return null }
  }
  const actual = buzzsproutId(url)
  const expected = episodeUrls.map(buzzsproutId).find(Boolean)
  return !actual || !expected || actual === expected
}

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)]
    .map((m) => [m[1].toLowerCase(), decodeHtmlEntities(m[3])]))
}

function scope(url: string, label: string): 'episode' | 'show' {
  const path = new URL(url).pathname.replace(/\/+$/, '')
  if (archive(url)) return 'show'
  // Collection paths and publisher wording are evidence of an archive, never
  // proof that this episode has a direct transcript. Unknown links stay broad.
  if (/^(?:\/(?:podcast\/)?transcripts?|\/episodes)$/i.test(path)
    || /\/transcripts\/(?:the-magnus-(?:archives|protocol))$/i.test(path)
    || /\b(?:all|more|additional|our|show)\s+transcripts?\b|\btranscript (?:archive|library|collection)\b/i.test(label)) return 'show'
  if (/transcript[^/]*\/[^/]+|\/[^/]+[-_]transcript|\/\d+\/transcript|\/transcript\/\d+/i.test(path)
    || /\.(?:txt|vtt|srt|pdf|json)$/i.test(path)
    || /\b(?:this|the) episode\b|\bepisode\s+\d+\b/i.test(label)) return 'episode'
  return 'show'
}

/** Accept only links explicitly advertised by the publisher as transcripts. */
export function podcastTranscriptLinks(notes: string, declared: unknown = [], base?: string, audioUrl?: string): PodcastTranscriptLink[] {
  const links = new Map<string, PodcastTranscriptLink>()
  const add = (link: PodcastTranscriptLink) => {
    if (!transcriptMatchesEpisode(link.url, audioUrl, base)) return
    if (archive(link.url)) link = { ...link, scope: 'show' }
    else if (new URL(link.url).hostname === 'albasalix.com' && /^\/episodes\/.+/.test(new URL(link.url).pathname)) link = { ...link, scope: 'episode' }
    if (links.size >= 8) return
    const old = links.get(link.url)
    if (!old || link.source === 'feed') links.set(link.url, link)
  }
  for (const item of Array.isArray(declared) ? declared.slice(0, 16) : []) {
    if (!item || typeof item !== 'object') continue
    const value = item as Record<string, unknown>
    const url = transcriptUrl(value.url)
    if (!url || !['feed', 'show_notes'].includes(String(value.source))) continue
    const type = typeof value.type === 'string' && formats.test(value.type) ? value.type : undefined
    const language = typeof value.language === 'string' && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value.language) ? value.language : undefined
    add({ url, scope: value.scope === 'episode' ? 'episode' : 'show', source: value.source as PodcastTranscriptLink['source'], ...(type ? { type } : {}), ...(language ? { language } : {}) })
  }
  let text = notes.slice(0, 100_000)
  for (let i = 0; i < 3; i++) {
    const next = decodeHtmlEntities(text)
    if (next === text) break
    text = next
  }
  // An anchor's own label is authoritative; unrelated links nearby are not.
  for (const match of text.matchAll(/<a\b([^>]{0,4096})>([\s\S]{0,2000}?)<\/a>/gi)) {
    const label = stripHtmlTags(match[2]).trim()
    const href = attributes(match[1]).href
    const url = transcriptUrl(href, base)
    if (url && transcriptWord.test(label)) {
      add({ url, scope: scope(url, label), source: 'show_notes' })
    }
  }
  // Remove anchors (including their URLs) before scanning plain-text links.
  // Plain links need a transcript URL path or an immediate transcript label.
  text = text.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, ' ')
  text = stripHtmlTags(text)
  for (const match of text.matchAll(/https?:\/\/[^\s<>"\u200b]+/gi)) {
    const raw = match[0].replace(/[.,;!?]+$/, '').replace(/[)\]]+$/, '')
    const url = transcriptUrl(raw)
    if (!url) continue
    const before = text.slice(Math.max(0, match.index! - 100), match.index).trim()
    if (!/(?:transcripts?|transkripte?|transcripci[oó]n)\s*(?:(?:for (?:this|the) episode|(?:are )?available|can be found|here|at|:|[-–—])\s*){0,4}$/i.test(before)) continue
    add({ url, scope: scope(url, before), source: 'show_notes' })
  }
  return [...links.values()]
}

/** Podcasting 2.0 allows the namespace prefix to vary between publishers. */
export function feedTranscriptLinks(item: string, feed: string): PodcastTranscriptLink[] {
  const prefixes = new Set<string>()
  for (const match of feed.slice(0, 8000).matchAll(/xmlns:([\w-]+)\s*=\s*["']https?:\/\/podcastindex\.org\/namespace\/1\.0\/?["']/gi)) prefixes.add(match[1])
  const links: PodcastTranscriptLink[] = []
  for (const match of item.matchAll(/<([\w-]+):transcript\b[^>]*>/gi)) {
    if (!prefixes.has(match[1])) continue
    const a = attributes(match[0])
    const url = transcriptUrl(a.url)
    if (!url || !formats.test(a.type ?? '')) continue
    links.push({ url, scope: 'episode', source: 'feed', type: a.type, ...(a.language ? { language: a.language } : {}) })
  }
  return podcastTranscriptLinks('', links)
}
