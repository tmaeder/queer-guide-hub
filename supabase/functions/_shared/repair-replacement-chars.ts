// Recover characters that a wrong decode turned into U+FFFD.
//
// A Latin-1/windows-1252 document decoded as UTF-8 loses every byte >= 0x80,
// one U+FFFD per byte, and each of those bytes is exactly one character
// (ä ö ü ß é, „ “ – …). The stored text no longer knows which character was
// there — but the publisher's page still does. Given the same document
// decoded CORRECTLY, each run of k replacement characters is restored by
// finding its surrounding context in the source and reading the k characters
// between. Nothing is guessed: a run is only filled when its context occurs in
// the source and every occurrence agrees on the fill.

const FFFD = '\uFFFD'
const CONTEXT = 24
const MIN_CONTEXT = 3

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', ccedil: 'ç',
  ndash: '–', mdash: '—', hellip: '…', bdquo: '„', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', sbquo: '‚', laquo: '«', raquo: '»',
}

/** HTML/XML → plain text with collapsed whitespace, for context matching. */
export function sourceTextFromMarkup(markup: string): string {
  return markup
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m)
    .replace(/\s+/g, ' ')
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
}

export interface RepairResult {
  text: string
  /** Replacement characters restored. */
  repaired: number
  /** Replacement characters left in place (context not found or ambiguous). */
  remaining: number
}

export function repairReplacementChars(broken: string, source: string): RepairResult {
  if (!broken.includes(FFFD)) return { text: broken, repaired: 0, remaining: 0 }
  const src = source.replace(/\s+/g, ' ')
  const text = broken
  let out = ''
  let i = 0
  let repaired = 0
  let remaining = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch !== FFFD) { out += ch; i++; continue }
    let j = i
    while (j < text.length && text[j] === FFFD) j++
    const k = j - i
    // Context stops at the previous/next replacement run: that one is
    // unknown too and cannot anchor a match.
    const leftFull = text.slice(Math.max(0, i - CONTEXT), i)
    const left = leftFull.slice(leftFull.lastIndexOf(FFFD) + 1).replace(/\s+/g, ' ')
    const rightFull = text.slice(j, j + CONTEXT)
    const ri = rightFull.indexOf(FFFD)
    const right = (ri === -1 ? rightFull : rightFull.slice(0, ri)).replace(/\s+/g, ' ')
    const fill = findFill(src, left, right, k)
    if (fill !== null) { out += fill; repaired += k } else { out += text.slice(i, j); remaining += k }
    i = j
  }
  return { text: out, repaired, remaining }
}

function findFill(src: string, left: string, right: string, k: number): string | null {
  // Shrink the context from the outside until it matches; prefer the longest
  // context that still occurs, and require every occurrence to agree.
  for (let lLen = left.length, rLen = right.length; lLen + rLen >= MIN_CONTEXT;) {
    const l = left.slice(left.length - lLen)
    const r = right.slice(0, rLen)
    const re = new RegExp(`${escapeRe(l)}([\\s\\S]{${k}})${escapeRe(r)}`, 'g')
    const fills = new Set<string>()
    for (const m of src.matchAll(re)) fills.add(m[1])
    if (fills.size === 1) {
      const f = [...fills][0]
      // A recovered character is never ASCII: an ASCII byte decodes fine as
      // UTF-8, so it can never have become U+FFFD.
      return [...f].every((c) => c.charCodeAt(0) > 0x7f) ? f : null
    }
    if (fills.size > 1) return null
    if (lLen >= rLen && lLen > 0) lLen--
    else if (rLen > 0) rLen--
    else break
  }
  return null
}
