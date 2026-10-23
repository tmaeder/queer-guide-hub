/** A stored website with no scheme would resolve relative to the current page. */
export function toWebsiteHref(website: unknown): string | null {
  if (typeof website !== 'string') return null;
  const url = website.trim();
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
