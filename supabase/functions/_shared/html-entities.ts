// ============================================================
// Single-pass HTML entity decoding.
//
// WHY A SINGLE PASS IS THE WHOLE POINT. The obvious implementation is a
// chain of replaces:
//
//   s.replace(/&#(\d+);/g, numeric)
//    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')...
//
// and it is a real vulnerability, not a style problem — CodeQL flags it as
// `js/double-escaping` (high). Each replace RE-SCANS the previous one's
// output, so a decoded character can be re-interpreted as the start of a new
// entity. Concretely: `&#38;lt;` decodes to `&lt;` in the numeric pass, and
// the later `&lt;` -> `<` pass then turns it into a literal `<`. Feed that
// through a tag stripper that already ran and you have smuggled a tag in.
//
// Scanning once with one regex and a lookup means no replacement output is
// ever re-examined, so the class cannot occur.
// ============================================================

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Surrogates and out-of-range values are left as written rather than thrown on. */
function fromCodePoint(cp: number): string | null {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return null
  if (cp >= 0xd800 && cp <= 0xdfff) return null
  try {
    return String.fromCodePoint(cp)
  } catch {
    return null
  }
}

/**
 * Decode the entities these feeds actually emit, in one pass.
 *
 * An unrecognised entity is returned verbatim — a parser's job here is to
 * render source text faithfully, and silently dropping `&foo;` loses
 * information without telling anyone.
 */
export function decodeEntities(input: string): string {
  return input.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const cp = hex ? parseInt(body.slice(2), 16) : Number(body.slice(1))
      return fromCodePoint(cp) ?? match
    }
    return NAMED[body.toLowerCase()] ?? match
  })
}

/** Strip tags, then decode — in that order, so a decoded `<` can never form a tag. */
export function stripTagsAndDecode(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}
