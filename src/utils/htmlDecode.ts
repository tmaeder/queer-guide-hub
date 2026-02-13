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
