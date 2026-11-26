// Single shared entity decoder (regex-based, DOM-free) — the former
// textarea-innerHTML implementation here duplicated it under the same name.
import { cleanNewsBody, cleanNewsText } from '@/lib/newsTextCleanup';
import { decodeHtmlEntities } from '@/lib/decodeHtmlEntities';

export { decodeHtmlEntities };

/**
 * Strip HTML tags from a string, returning plain text.
 *
 * Implemented as a single-pass character state machine \u2014 `<` opens "inside
 * tag" mode, `>` closes it, content outside tag mode is emitted. No DOM
 * parsing of untrusted input, and no regex match-and-replace on tags so
 * CodeQL's "incomplete multi-character sanitization" rule (alerts #105 /
 * #519) has nothing pattern-based to flag. Smuggled-tag bypasses like
 * `<scr<script>ipt>` cannot survive: any `<` reopens tag mode, and the
 * matching `>` closes it cleanly with no payload reaching the output as a
 * tag.
 *
 * The previous implementation collapsed to `.replace(/[<>]/g, '')` after
 * the CodeQL #105 autofix sweep, which stripped only the angle brackets and
 * left the tag names behind \u2014 `<p>hello</p>` became `phello/p`. The state
 * machine restores correct behaviour without falling back into the same
 * regex-based pattern the rule warns about.
 */
export function stripHtmlTags(html: string): string {
  if (!html) return '';
  const LT = 60; // <
  const GT = 62; // >
  let out = '';
  let inside = false;
  for (let i = 0; i < html.length; i++) {
    const code = html.charCodeAt(i);
    if (code === LT) {
      inside = true;
    } else if (code === GT) {
      inside = false;
    } else if (!inside) {
      out += html[i];
    }
  }
  return out.replace(/&nbsp;/gi, ' ').replace(/\u00A0/g, ' ');
}

/**
 * Clean an author string:
 * - Strip HTML tags
 * - Remove Reddit-style /u/ prefixes and appended profile URLs
 * - Remove any leftover URLs
 * - Trim and return clean name, or empty string if nothing useful remains
 */
export function cleanAuthor(raw: string): string {
  if (!raw) return '';
  // Ingestion sometimes stores `author` as a JSON-encoded array string
  // (e.g. '["Author Name"]'). Detect and unwrap so brackets/quotes don't
  // leak into the rendered byline. Wrapped in try/catch — some authors
  // legitimately contain `[` (pseudonyms, brackets), in which case we just
  // continue with the original string.
  let working = raw;
  if (working.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(working);
      if (Array.isArray(parsed)) {
        working = parsed.filter((v) => typeof v === 'string' && v.trim()).join(', ');
      }
    } catch {
      /* not JSON — fall through with the original */
    }
  }
  // Decode entities first (handles `Jane &amp; John`, `O&#039;Brien`) then strip tags.
  let author = stripHtmlTags(decodeHtmlEntities(working));
  // Reddit: "/u/NamelessResearcherhttps://www.reddit.com/user/NamelessResearcher"
  author = author.replace(/https?:\/\/\S+/g, '').trim();
  // Reddit /u/ prefix → just the username
  author = author.replace(/^\/u\//, '').trim();
  // Reject URL-slug fragments left over from ingestion fallback (e.g. "capital;main",
  // "/some-path"). Mirrors the news_articles_sanitize_author DB trigger so client
  // SPA caches don't display them either.
  if (/;/.test(author)) return '';
  if (/^\/[a-z0-9_-]+$/i.test(author)) return '';
  if (/^(none|null|undefined|unknown)$/i.test(author.trim())) return '';
  // If nothing useful remains, return empty
  if (!author || author.length < 2) return '';
  return author;
}

/**
 * Clean an excerpt string:
 * - Decode HTML entities first (handles &lt;a&gt; → <a>)
 * - Strip resulting HTML tags
 * - Decode entities again (handles &amp;nbsp; etc.)
 * - Remove leftover URLs
 * - Remove trailing RSS junk (Continue reading → ...)
 * - Collapse whitespace
 */
export function cleanExcerpt(raw: string): string {
  if (!raw) return '';
  return cleanNewsText(raw, { field: 'excerpt' })
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean a headline for display:
 * - Decode HTML entities (handles &#038; → &, &#8217; → ’, &amp; → &)
 * - Strip any real tags so encoded markup (&lt;p&gt;) never renders as literal text
 * - Decode once more for double-encoded entities, then collapse whitespace
 * Single-line — titles never carry paragraph breaks.
 */
export function cleanTitle(raw: string): string {
  if (!raw) return '';
  let text = decodeHtmlEntities(raw);
  text = stripHtmlTags(text);
  text = decodeHtmlEntities(text);
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Clean article content for display:
 * - Decode HTML entities
 * - Strip HTML tags
 * - Remove &nbsp; / non-breaking spaces
 * - Remove trailing RSS junk ("The post X appeared first on Y", "Subscribe to…", etc.)
 * - Normalize paragraph breaks (3+ newlines → 2)
 * - Trim whitespace from each line
 * - Remove empty lines at start/end
 */
export function cleanContent(raw: string, excerpt = '', title?: string): string {
  if (!raw) return '';

  return cleanNewsBody(raw, excerpt, title);
}

/**
 * Maximum characters of a third-party article body we render on our own page.
 *
 * We store the full body because the ingest pipeline needs it (the dedup
 * identity arm compares `news_articles.content` byte-for-byte, and the
 * quality/entity-link stages read the prose), but we must not REPUBLISH it.
 * Measured on prod 2026-09-02: stored content matched the live article at a
 * median length ratio of 1.02, and 8 of 11 fetchable samples contained both
 * the source article's first AND last paragraph verbatim — i.e. complete
 * copies, not excerpts. Rendering that in full is republication.
 */
export const ARTICLE_BODY_MAX_CHARS = 1200;

/**
 * Bound an article body to a readable excerpt, cutting on a natural boundary.
 *
 * Prefers a paragraph break, then a sentence end, then a word break — never
 * mid-word. Returns `truncated` so the caller shows the "read the rest at the
 * source" affordance only when there is actually more to read.
 *
 * Display-only. Never feed the result into anything that writes to the
 * database: the admin inline editor must keep receiving the full text, or
 * saving would overwrite the stored body with this excerpt.
 */
export function boundArticleBody(
  raw: string,
  max: number = ARTICLE_BODY_MAX_CHARS,
): { text: string; truncated: boolean } {
  if (!raw) return { text: '', truncated: false };
  if (raw.length <= max) return { text: raw, truncated: false };

  const window = raw.slice(0, max);

  // Prefer the last paragraph break, if it keeps at least half the budget.
  const para = window.lastIndexOf('\n\n');
  if (para >= max * 0.5) return { text: window.slice(0, para).trimEnd(), truncated: true };

  // Then the last sentence end.
  const sentence = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
    window.lastIndexOf('.\n'),
  );
  if (sentence >= max * 0.5) {
    return { text: window.slice(0, sentence + 1).trimEnd(), truncated: true };
  }

  // Fall back to the last word break so we never cut mid-word.
  const space = window.lastIndexOf(' ');
  const cut = space > 0 ? space : max;
  return { text: window.slice(0, cut).trimEnd() + '…', truncated: true };
}
