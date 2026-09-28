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
 * `extra` is merged over the defaults so a caller with a richer table (the
 * German and Dutch feeds carry umlauts, dashes and typographic quotes as
 * named entities) keeps exactly the coverage it had before. That is what
 * makes this safe to retrofit onto an existing parser: the vulnerable
 * ORDERING changes, the vocabulary does not.
 *
 * Lookup tries exact case first and only then lowercase, because a few of
 * those tables distinguish them — `&AElig;` is Æ while `&aelig;` is æ, and a
 * blanket lowercase would silently collapse the pair.
 *
 * An unrecognised entity is returned verbatim — a parser's job here is to
 * render source text faithfully, and silently dropping `&foo;` loses
 * information without telling anyone.
 */
export function decodeEntities(input: string, extra?: Record<string, string>): string {
  const table = extra ? { ...NAMED, ...extra } : NAMED
  return input.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const cp = hex ? parseInt(body.slice(2), 16) : Number(body.slice(1))
      return fromCodePoint(cp) ?? match
    }
    return table[body] ?? table[body.toLowerCase()] ?? match
  })
}

/** Strip tags, then decode — in that order, so a decoded `<` can never form a tag. */
export function stripTagsAndDecode(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * Entities whose output can be re-read as markup or as the start of another
 * entity. These are exactly what a second decoding pass must refuse.
 */
const MARKUP_PRODUCING = new Set(['amp', 'lt', 'gt', 'quot', 'apos'])

/**
 * Decode, then decode ONCE more — but the second pass may not produce markup.
 *
 * Some feeds genuinely double-encode: eventfrog emits `S&amp;uuml;dpol` and
 * means `Südpol`, and a single pass would leave a visible `&uuml;` in the
 * title. Its original implementation handled that by re-running the whole
 * decoder, which is precisely the `js/double-escaping` hole — `&amp;lt;`
 * came out as `<`.
 *
 * Both requirements are satisfiable at once, because they are about
 * different entities. The second pass decodes only NAMED entities that
 * cannot yield `& < > " '`, so:
 *
 *   S&amp;uuml;dpol  ->  S&uuml;dpol  ->  Südpol     (recovered, as intended)
 *   &amp;lt;         ->  &lt;         ->  &lt;       (refused, stays inert)
 *
 * Numeric forms are deliberately excluded from the second pass entirely:
 * `&#38;` and `&#60;` are the same hazard wearing a different spelling.
 */
export function decodeEntitiesDeep(input: string, extra?: Record<string, string>): string {
  const table = extra ? { ...NAMED, ...extra } : NAMED
  const once = decodeEntities(input, extra)
  return once.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name: string) => {
    if (MARKUP_PRODUCING.has(name.toLowerCase())) return match
    const v = table[name] ?? table[name.toLowerCase()]
    return v !== undefined && !/[&<>"']/.test(v) ? v : match
  })
}
