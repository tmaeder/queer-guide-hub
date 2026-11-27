import { applyNewsSourceLayout } from './source-layout-core.ts'
// One deterministic, wording-preserving policy for browser display and ingestion.
import { EXACT_PHRASES } from './junk-phrases.ts'
import { decodeHtmlEntities } from './html-entities.ts'
import { stripRawTextElements, stripCodeResidue, detectCodeResidue } from './code-residue.ts'

export const NEWS_TEXT_VERSION = '2026.11.27.1'
const BLOCKS = new Set('p div section article header footer aside figure figcaption blockquote h1 h2 h3 h4 h5 h6 ul ol li table tr hr'.split(' '))
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '))
const NOISE_CLASSES = new Set('share sharing sharedaddy social-sharing social-share newsletter related related-articles recommended cookie-consent advertisement ads lee-tambien-bbcl'.split(' '))

// Quote-aware tag scanner: preserve comparisons, discard comments and raw code,
// and keep block boundaries. Drop only explicitly identified interface subtrees.
export function newsHtmlToText(raw: string): string {
  if (!raw || !raw.includes('<')) return raw || ''
  const html = stripRawTextElements(raw)
  const lower = html.toLowerCase()
  let out = '', i = 0
  const stack: Array<{ name: string; noise: boolean }> = []
  let hidden = 0
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4)
      if (end < 0) { i += 4; continue }
      i = end + 3; continue
    }
    if (html[i] !== '<' || !/^<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s|\/?>)/.test(html.slice(i, i + 100))) {
      if (!hidden) out += html[i]
      i++; continue
    }
    let end = i + 1, quote = ''
    for (; end < html.length; end++) {
      const c = html[end]
      if (quote) { if (c === quote) quote = '' }
      else if (c === '"' || c === "'") quote = c
      else if (c === '>') break
    }
    if (end === html.length) { if (!hidden) out += html.slice(i); break }
    const tag = html.slice(i + 1, end)
    const closing = tag[0] === '/'
    const name = tag.replace(/^\//, '').match(/^[\w:-]+/)![0].toLowerCase()
    if (closing) {
      const at = stack.map(x => x.name).lastIndexOf(name)
      if (at >= 0) {
        for (const entry of stack.splice(at)) if (entry.noise) hidden--
      }
    } else {
      const classes = tag.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1].split(/\s+/) ?? []
      const subtree = name === 'blockquote' ? html.slice(end + 1, lower.indexOf('</blockquote', end)) : ''
      const card = name === 'blockquote' && /<h[23]\b[^>]*>\s*Related(?: articles)?\s*<\/h[23]>/i.test(subtree) && /href\s*=\s*["'][^"']*[?&](?:amp;)?utm_medium=related_links/i.test(subtree)
      const noise = lower.indexOf(`</${name}`, end) >= 0 && (card || classes.some(c => NOISE_CLASSES.has(c.toLowerCase())) || /\b(?:aria-hidden\s*=\s*["']true["']|hidden(?:\s|$)|style\s*=\s*["'][^"']*display\s*:\s*none)/i.test(tag))
      if (!VOID.has(name) && !tag.endsWith('/')) {
        stack.push({ name, noise }); if (noise) hidden++
      }
    }
    if (!hidden) {
      if (BLOCKS.has(name)) out += '\n\n'
      else if (name === 'br') out += '\n'
      else if (name === 'td' || name === 'th') out += ' '
    }
    i = end + 1
  }
  return out
}

function markdownToText(raw: string): string {
  // Keep link labels and image alt text. Balance URL parentheses (Wikipedia URLs).
  let out = raw.includes('[') ? '' : raw, i = raw.includes('[') ? 0 : raw.length
  while (i < raw.length) {
    const image = raw.startsWith('![', i)
    if (raw[i] === '[' || image) {
      const start = i + (image ? 2 : 1)
      const labelEnd = raw.indexOf('](', start)
      if (labelEnd >= 0 && !raw.slice(start, labelEnd).includes('\n')) {
        let depth = 1, end = labelEnd + 2
        for (; end < raw.length && raw[end] !== '\n'; end++) {
          if (raw[end] === '(') depth++
          if (raw[end] === ')' && --depth === 0) break
        }
        const destination = raw.slice(labelEnd + 2, end)
        if (depth === 0 && /^(?:https?:\/\/|\/|#)/i.test(destination)) {
          out += raw.slice(start, labelEnd); i = end + 1; continue
        }
      }
    }
    out += raw[i++]
  }
  return out
    .replace(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?$/gm, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1')
    .replace(/^\s*(?:[-*_]\s*){3,}$/gm, '')
}

const STANDALONE_NOISE = [
  /^Get our breaking news email, free app or daily news podcast[.!]?$/i,
  /^(?:share(?: this(?: article)?)?|like this|source link|show caption|skip to next photo|advertisement|cookie preferences|manage cookie settings|accept all cookies|reject all cookies)\s*[:.!→-]*$/i,
  /^(?:share on (Facebook|Twitter|X|LinkedIn|WhatsApp|Tumblr|Reddit|Pinterest)(?:\s+\1)?|Email this|Print this article|Tweet this|Pin this)\s*[:.!]*$/i,
  /^(?:Facebook|Twitter|X|WhatsApp|Email|LinkedIn|Pinterest|Tumblr|Reddit|SMS)(?:\s+(?:Facebook|Twitter|X|WhatsApp|Email|LinkedIn|Pinterest|Tumblr|Reddit|SMS)){2,}\s*$/i,
  /^(?:sign up for|subscribe to|join) (?:our|the .{1,60}) newsletter\b[^\n]{0,160}$/i,
  /^(?:ONLY AVAILABLE IN PAID PLANS|this (?:article|content) is for subscribers only|subscribe to (?:read|continue)(?: the full article| reading)?|nur für abonnenten|réservé aux abonnés|solo para suscriptores|solo per abbonati)[.!]?$/i,
  /^(?:Please enable JavaScript(?: in your browser| to view this content)?|JavaScript is disabled in your browser|Your browser does not support the (?:video tag|audio element)|This video is no longer available)[.!]?$/i,
  /^To view this video please enable JavaScript, and consider upgrading to a web browser that supports HTML5 video[.!]?$/i,
  /^Podcast:\s*Play in new window\s*\|\s*Download\s*$/i,
  /^Subscribe:\s*[^\n]{0,160}\b(?:RSS|TuneIn)\b[^\n]{0,160}$/i,
]

const EXACT_NOISE = new Set(EXACT_PHRASES.map(phrase => phrase.toLowerCase()))

function isNoiseLine(line: string): boolean {
  const text = line.trim()
  return STANDALONE_NOISE.some(re => re.test(text)) || EXACT_NOISE.has(text.toLowerCase().replace(/[.!:]$/, ''))
}

export function cleanNewsText(raw: string, options: { field?: 'title' | 'excerpt' | 'body'; title?: string } = {}): string {
  if (!raw) return ''
  let text = raw.replace(/\r\n?/g, '\n')
  for (let pass = 0; pass < 4; pass++) {
    const next = newsHtmlToText(decodeHtmlEntities(text))
    if (next === text) break
    text = next
  }
  text = markdownToText(stripCodeResidue(text).text)
  text = text.replace(/^\[(?:semi-satire|satire|parody|sponsored|advertorial)\]\s*/i, '')
  if (options.field !== 'title') {
    text = text.replace(/(?<![\p{L}“"‘'])ONLY AVAILABLE IN PAID PLANS(?![\p{L}”"’'])/gu, '')
    text = text.replace(/To view this video please enable JavaScript, and consider upgrading to a web browser that supports HTML5 video/g, '')
    text = text.replace(/\bUp Next\s+Previous Page\s+Next Page\b/g, '')
    // Observed inline newsletter widgets have exact start/end markers. Require
    // both markers; never remove an open-ended run of article prose.
    text = text.replace(/(?:How about we take this to the next level\?|Dive deeper every day|Get off the sidelines and into the game|Your LGBTQ\+ guide to Elections)\s+(?:(?!Subscribe to our Newsletter today)[\s\S]){0,700}Subscribe to our Newsletter today/gi, '')
    text = text.replace(/\(opens? in (?:a )?new (?:window|tab)\)/gi, '')
    text = text.split('\n').filter(line => !isNoiseLine(line)).join('\n')
    // RSS suffixes, bounded to the end so quoted mentions inside reporting survive.
    // Bound each footer field; an unbounded match could start at 'the post office'
    // in reporting and consume the whole article up to the actual RSS footer.
    for (let footer = 0; footer < 4; footer++) {
      const next = text.replace(/(?:^|\s)The post [^\n]{1,240}? (?:appeared first|first appeared) on [^\n]{1,150}\.?\s*$/i, '')
      if (next === text) break
      text = next
    }
    text = text.replace(/(?:^|\n)L[’']article [^\n]{1,240} est apparu en premier sur [^\n]{1,100}\.?\s*$/i, '')
    text = text.replace(/(?:\n+|\s*…\s*)Continue reading [^\n]+(?:→)?\s*$/i, '')
    text = text.replace(/\n+\s*(?:Related|Related articles|You may also like)\s*$/i, '')
    text = text.replace(/(?:^|\n)The rest of this article can be read on[^\n]*\s*$/i, '')
  }
  text = text.replace(/\u00a0/g, ' ').replace(/[\u200b\ufeff]/g, '')
    .split('\n').map(line => line.replace(/[\t ]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim()
  // Only remove a title repeated as a leading standalone heading, never prose.
  if (options.title) {
    while (text.split('\n', 1)[0] === options.title.trim() && text.includes('\n')) {
      text = text.slice(text.indexOf('\n')).trimStart()
    }
  }
  return options.field === 'title' || options.field === 'excerpt' ? text.replace(/\s+/g, ' ').trim() : text
}

// Signals for review, not permission to guess at or delete unfamiliar prose.
export function newsTextIssues(text: string): string[] {
  const issues: string[] = []
  if (detectCodeResidue(text)) issues.push('code_residue')
  if (/<\/?(?:p|div|script|style|iframe|figure|span)\b[^>]*>/i.test(text)) issues.push('html_residue')
  if (/\b(?:class|srcset|fetchpriority|decoding)=["']/i.test(text)) issues.push('markup_residue')
  if (/\bpic\.twitter\.com\//i.test(text) || /(?:^|\n)Related(?: articles)?(?:\n|$)/i.test(text)) issues.push('source_widget_residue')
  if (/Subscribe to our Newsletter today/i.test(text)) issues.push('newsletter_widget')
  if (text.split('\n').some(isNoiseLine)) issues.push('publisher_clutter')
  return issues
}

// Recover every exact source block, including bodies whose first few breaks were
// already repaired. Matching never introduces, replaces, or reorders prose.
export function cleanNewsBody(raw: string, excerpt = '', title?: string): string {
  const body = cleanNewsText(raw, { title })
  if (!excerpt) return body
  const formatted = cleanNewsText(excerpt, { title })
  if (!formatted.includes('\n')) return body
  return cleanNewsText(applyNewsSourceLayout(body, { blocks: formatted.split(/\n+/), noise: [] }), { title })
}

// A large deletion needs review even if a future rule appears to recognize it.
// This catches accidental truncation without claiming unfamiliar prose is junk.
export function newsCleanupSafetyIssues(raw: string, cleaned: string): string[] {
  return raw.length > 1000 && cleaned.length < raw.length * 0.6 ? ['excessive_cleanup'] : []
}
