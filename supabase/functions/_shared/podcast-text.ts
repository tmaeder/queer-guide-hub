import { decodeHtmlEntities, stripHtmlTags } from './news-quality/sanitize.ts'

export const PODCAST_TEXT_VERSION = 1
export const PODCAST_SUMMARY_LIMIT = 420

export function podcastSourceNotes(content: string, rawNotes?: string | null): string {
  const compact = (s: string) => s.replace(/\\n|\\r/g, ' ').replace(/\s+/g, ' ').trim()
  return rawNotes && compact(rawNotes) === compact(content) ? rawNotes : content
}

// These match calls to action, not subjects: an episode ABOUT sponsorship,
// donations, social media, or Patreon must keep its editorial description.
const PROMOTION = /^(?:(?:please\s+)?(?:subscribe|follow|rate|review|donate|support|join|sign up|buy|shop|check out|visit|watch|listen|connect|contact|send|email|find|get)\b.{0,100}\b(?:us|our|me|show|podcast|patreon|newsletter|instagram|tiktok|facebook|youtube|spotify|apple|merch|bonus|ad-free|course|tickets|cruise)\b|(?:if you (?:want|would like|enjoy)|want to support|help (?:us|support))\b|(?:this episode is|today['’]?s episode is|we (?:are|['’]re))\s+(?:sponsored|supported|brought to you)\b|(?:learn more|see|visit)\b.{0,100}\b(?:adchoices|privacy|advertising|omnystudio|acast)\b|(?:only on patreon|on (?:the|our) patreon|patreon bonus|going to miss us|we have merch|we run off of donations|ways to support|use (?:the |our )?code)\b)/i
const PROMO_HEADING = /^(?:[-–—\s]*)(?:connect with us|follow us|support (?:us|the show|our show)|donate here|podcast platforms|learn with us|sponsors?|advertising|our merch|real virgins only)(?:\s*[-–—:]*|\s+@\S+)$/i
const LINK = /(?:https?:\/\/|www\.)\S+|\b(?:patreon|instagram|facebook|tiktok|twitter|omnystudio)\.com\/\S+/gi
const PROMO_LINE = /^(?:make sure to check .{0,60}podcast|visit \S+\.[a-z]{2,}\b|catch the latest episode on|listen on all streaming platforms|hosted on acast|podcast:\s*play in new window|uncategorized$|take (?:the|our) .{0,80}(?:quiz|self-review)|.{0,70}online course:|.{0,70}coaching collection:|\S+\s*:\s*newsletter\s*\||[A-Z0-9]{12,}\s+support this show|I promise[.)])/i

/** Preserve words, warnings and chapters; remove presentation and promotional clutter. */
export function cleanPodcastNotes(raw: string): string {
  let text = raw.slice(0, 100_000)
  for (let i = 0; i < 4; i++) {
    const next = stripHtmlTags(decodeHtmlEntities(text))
    if (next === text) break
    text = next
  }
  text = decodeHtmlEntities(text)
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\ufeff]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    // Old committed bodies collapsed every paragraph. Recover unambiguous
    // section boundaries without treating every mention of these words as junk.
    .replace(/\s+(?=(?:-\s*)?(?:CONNECT WITH US|LEARN WITH US|DONATE HERE|PODCAST PLATFORMS)\b)/g, '\n')
    .replace(/\s+(?=(?:If you want to (?:support|join)|On the Patreon bonus|Going to miss us\?|We have merch|We run off of donations|See omnystudio\.com|Learn more about your ad choices)\b)/g, '\n')
    .replace(/\s+(?=(?:In this episode:|Today['’]s Hosts:))/g, '\n')
    .replace(/\s+(?=Listen on all streaming Platforms\b)/gi, '\n')
    .replace(/\s+(?=Here we talk about\b)/g, '\n')
    .replace(/^(?:On Today['’]s Menu on .{0,80}?)(?=This week\b)/i, '')
    .replace(/^[^\n]{0,40}DISCUSSED IN THIS EPISODE[^\p{Script=Latin}\n]{0,40}/u, '')
    .replace(/\s+[^\p{Script=Latin}\n]{0,40}(?=ONLY ON PATREON\b)/gu, '\n')
    .replace(/\s+-\s+(?=Take the .{0,40}(?:Self-Review|Quiz))/g, '\n')

  const seen = new Set<string>()
  const kept: string[] = []
  let promotionalSection = false
  // Sentence boundaries also let us remove an ad between two useful paragraphs.
  // Keep punctuation and chapter timestamps; do not split decimal numbers/URLs.
  for (const line of text.split('\n')) {
    // Clearly marked promotional sections end at an editorial section marker.
    // An isolated ad sentence does not put the rest of the episode in this mode.
    const section = line.replace(/^[^A-Za-z]+/, '').trim()
    if (/^(?:ONLY ON PATREON|REAL VIRGINS ONLY|FOLLOW US|CONNECT WITH US|LEARN WITH US|DONATE HERE|PODCAST PLATFORMS)\b/.test(section)) {
      promotionalSection = true
      continue
    }
    if (/^(?:content warning|trigger warning|inhaltswarnung|chapters?|timestamps?|show notes|episode notes|resources?|reading recommendations)\s*:/i.test(section)) promotionalSection = false
    if (promotionalSection) continue
    if (/^.{0,60}DISCUSSED IN THIS EPISODE.{0,60}$/u.test(line.trim())) continue
    const chunks = line.split(/(?<=[.!?])\s+(?=[\p{Lu}])/u)
    for (let chunk of chunks) {
      chunk = chunk.trim()
      if (!chunk) continue
      // Decorative borders are noise; letters in all scripts remain intact.
      if (PROMO_HEADING.test(chunk) || PROMOTION.test(chunk) || PROMO_LINE.test(chunk)) continue
      // Strip URL destinations but retain meaningful resource/guest names.
      chunk = chunk.replace(LINK, '').replace(/(?:^|\s)#[\p{L}\p{N}_]+/gu, ' ')
        .replace(/(?:^|\s)@[\w.]+/g, ' ').replace(/[ \t]+/g, ' ').trim()
      chunk = chunk.replace(/^[^\p{L}\p{N}(@]+|[^\p{L}\p{N}.!?):"'’”]+$/gu, '').trim()
      if (!/[\p{L}\p{N}]/u.test(chunk) || chunk.length < 3) continue
      const key = chunk.toLocaleLowerCase().replace(/\s+/g, ' ')
      if (seen.has(key)) continue
      seen.add(key)
      kept.push(chunk)
    }
  }
  return kept.join('\n\n').trim()
}

function bounded(text: string, max = PODCAST_SUMMARY_LIMIT): string {
  if (text.length <= max) return text
  const head = text.slice(0, max - 1)
  const space = head.lastIndexOf(' ')
  return (space > max / 2 ? head.slice(0, space) : head).trimEnd() + '…'
}

export type PodcastSummaryMethod = 'ai_show_notes' | 'show_notes_extract' | 'unavailable'

/** Never fabricate a summary when the publisher supplied no usable episode detail. */
export function podcastText(raw: string, aiSummary?: string | null): {
  notes: string; summary: string; method: PodcastSummaryMethod
} {
  const notes = cleanPodcastNotes(raw)
  if (!notes) return { notes: '', summary: '', method: 'unavailable' }
  const ai = aiSummary ? cleanPodcastNotes(aiSummary).replace(/\s+/g, ' ').trim() : ''
  if (ai.length >= 20 && ai.length <= PODCAST_SUMMARY_LIMIT) {
    return { notes, summary: ai, method: 'ai_show_notes' }
  }
  // Keep up to three source sentences/list entries. Skip generic headings and
  // timestamp-only chapters in the overview, but keep them in the show notes.
  const candidates = notes.split('\n\n').filter((p) =>
    p.length >= 20 && !/^(?:(?:discussed in this episode|in this episode|chapters?|timestamps?|today['’]s hosts?)\s*:|on today['’]s menu\b|thanks to:)/i.test(p)
    && !/^\d{1,2}:\d{2}/.test(p))
  // Prefer an explicit episode description over opening rhetorical hooks.
  const intro = candidates.findIndex((p) => /^(?:in this episode(?:,|\s)|this week (?:we|the hosts)\b|today (?:we|the hosts)\b)/i.test(p))
  if (intro > 0) candidates.splice(0, intro)
  const selected: string[] = []
  for (const p of candidates) {
    if (selected.length === 3) break
    if (selected.length && [...selected, p].join(' ').length > PODCAST_SUMMARY_LIMIT) break
    selected.push(p)
  }
  const summary = bounded(selected.map((p, i) =>
    i < selected.length - 1 && !/[.!?。！？…]$/.test(p) ? p + '.' : p).join(' '))
  return { notes, summary, method: summary ? 'show_notes_extract' : 'unavailable' }
}
