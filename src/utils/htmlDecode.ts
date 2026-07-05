// Single shared entity decoder (regex-based, DOM-free) — the former
// textarea-innerHTML implementation here duplicated it under the same name.
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
  return out
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00A0/g, ' ');
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
  // First pass: decode entities so &lt;a href="..."&gt; becomes <a href="...">
  let text = decodeHtmlEntities(raw);
  // Strip the resulting real HTML tags
  text = stripHtmlTags(text);
  // Second pass: decode any remaining entities (&amp;nbsp; etc.)
  text = decodeHtmlEntities(text);
  // Remove leftover URLs that might remain after stripping tags
  text = text.replace(/https?:\/\/\S+/g, '').trim();
  // Remove trailing RSS junk + paywall/widget junk
  text = removeTrailingJunk(text);
  text = removePaywallJunk(text);
  // Collapse multiple whitespace/newlines into single space
  text = text.replace(/\s+/g, ' ').trim();
  return text;
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
export function cleanContent(raw: string): string {
  if (!raw) return '';

  // Decode HTML entities (two passes for double-encoded content)
  let text = decodeHtmlEntities(raw);
  text = stripHtmlTags(text);
  text = decodeHtmlEntities(text);

  // Replace &nbsp; / non-breaking spaces with regular spaces
  text = text.replace(/\u00A0/g, ' ');

  // Remove trailing RSS/CMS junk + paywall/widget junk
  text = removeTrailingJunk(text);
  text = removePaywallJunk(text);

  // Trim whitespace from each line
  text = text
    .split('\n')
    .map(line => line.trim())
    .join('\n');

  // Collapse 3+ consecutive newlines into exactly 2 (one blank line between paragraphs)
  text = text.replace(/\n{3,}/g, '\n\n');

  // Remove leading/trailing whitespace
  text = text.trim();

  return text;
}

/**
 * Remove common trailing junk from RSS/CMS content:
 * - "The post X appeared first on Y."
 * - "Continue reading X →"
 * - "Share your thoughts! Let us know in the comments…"
 * - "Subscribe to the X newsletter…"
 * - Inline "Related" section headers
 */
function removeTrailingJunk(text: string): string {
  // "The post ... appeared first on ..."  (WordPress RSS)
  text = text.replace(/\n*The post\s.+appeared first on\s.+\.?\s*$/i, '');

  // "Continue reading X →" or "Continue reading X &#8594;"
  text = text.replace(/\s*…?\s*Continue reading\s.+[→\u2192]?\s*$/i, '');

  // "Share your thoughts! Let us know in the comments below..."
  text = text.replace(/\n*Share your thoughts[!.]?\s*Let us know in the comments.*/i, '');

  // "Subscribe to the X newsletter..." (only at the end)
  text = text.replace(/\n*Subscribe to the\s.+newsletter.{0,100}$/i, '');

  // Trailing "Related\n" section headers (leftover from stripped related-article blocks)
  text = text.replace(/\n+\s*Related\s*$/i, '');

  // "The rest of this article can be read on..." (partial syndication)
  text = text.replace(/\n*The rest of this article can be read on.+$/i, '');

  return text.trim();
}

/**
 * Remove paywall + link-widget junk phrases anywhere in the text. Mirrors the
 * DB `news_strip_junk()` used at ingestion, so any residue that slips past the
 * server (e.g. a stale SPA cache) is still hidden from the reader.
 */
function removePaywallJunk(text: string): string {
  return text
    .replace(
      /only available in paid plans|this (?:article|content) is for subscribers only|subscribe to (?:read|continue)[^.\n]*|nur für abonnenten|réservé aux abonnés|solo para suscriptores|solo per abbonati|\(opens? in (?:a )?new (?:window|tab)\)/gi,
      ' ',
    )
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
