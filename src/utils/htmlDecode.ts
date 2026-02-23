/**
 * Decode HTML entities (e.g., &amp; → &, &lt; → <, &quot; → ")
 * Uses a textarea element trick for browser-native decoding.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

/**
 * Strip HTML tags from a string, returning plain text.
 * Also decodes HTML entities in the result.
 */
export function stripHtmlTags(html: string): string {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
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
  let author = stripHtmlTags(raw);
  // Reddit: "/u/NamelessResearcherhttps://www.reddit.com/user/NamelessResearcher"
  author = author.replace(/https?:\/\/\S+/g, '').trim();
  // Reddit /u/ prefix → just the username
  author = author.replace(/^\/u\//, '').trim();
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
  // Remove trailing RSS junk
  text = removeTrailingJunk(text);
  // Collapse multiple whitespace/newlines into single space
  text = text.replace(/\s+/g, ' ').trim();
  return text;
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

  // Remove trailing RSS/CMS junk
  text = removeTrailingJunk(text);

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
