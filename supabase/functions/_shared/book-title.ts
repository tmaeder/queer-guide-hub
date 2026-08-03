// Book-trade shops put the author inside the display title. Splitting it at ingest
// keeps the author out of `title` (so marketplace-translate never translates a
// person's name), puts it in `brand`, and makes the commit-generated slug readable.
//
// Lives here rather than inside source-shop-crawl because that module calls
// Deno.serve at import time, so a test importing it would start a server.

export interface SplitTitle {
  title: string
  author: string | null
}

/** Bindings the shop appends to the display title; they belong to neither half. */
const BINDING_SUFFIX = /\s*\((?:paperback|hardback|hardcover|e-?book|audiobook|audio\s*cd|paperback\s*\/\s*softback)\)\s*$/i

/** Editorial-role connectives left dangling on the title after a " by " split. */
const ROLE_SUFFIX = /[,;]?\s*(?:edited|translated|illustrated|foreword|introduction)\s*$/i

/**
 * `title_by`     "Work Title by Author Name (Paperback)"  (Gay's The Word / Wix)
 * `title_colon`  "Surname, Firstname: Work Title"         (queerbooks.ch / nopCommerce)
 *
 * Returns the raw title unchanged with a null author when no pattern matches — never
 * guess, an unsplit title is recoverable and a wrong author is not.
 */
export function splitAuthor(rawTitle: string, mode: string | undefined): SplitTitle {
  const t = String(rawTitle ?? '').trim()

  if (mode === 'title_by') {
    // GREEDY on the title half so the split lands on the LAST " by ". A lazy match
    // turns "A Room by the Sea by Jane Doe" into "A Room" / "the Sea by Jane Doe".
    const m = t.match(/^(.+)\s+by\s+(.+)$/i)
    if (m) {
      const author = m[2].replace(BINDING_SUFFIX, '').trim()
      const title = m[1].replace(ROLE_SUFFIX, '').trim()
      if (title && author) return { title, author }
    }
  }

  if (mode === 'title_colon') {
    // "Surname, Firstname: Work Title" -> author "Firstname Surname"
    const m = t.match(/^([^:,]+),\s*([^:]+):\s*(.+)$/)
    if (m) return { title: m[3].trim(), author: `${m[2].trim()} ${m[1].trim()}` }
  }

  return { title: t, author: null }
}
