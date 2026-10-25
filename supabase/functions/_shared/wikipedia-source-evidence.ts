/** Bind an official page-presence result to the exact registered mainspace link.
 * Missing articles are different from disambiguation, redirects and HTTP errors.
 */
export function registeredWikipediaTitle(sourceUrl: string, sourceEntityId: string): string | null {
  try {
    const u = new URL(sourceUrl)
    if (u.origin !== 'https://en.wikipedia.org' || u.username || u.password || u.search || u.hash
      || !u.pathname.startsWith('/wiki/') || !sourceEntityId.startsWith('wp:')) return null
    const title = decodeURIComponent(u.pathname.slice(6)).replaceAll('_', ' ').normalize('NFC')
    const identity = sourceEntityId.slice(3).split('|')[0].replaceAll('_', ' ').normalize('NFC')
    if (!title.trim() || title !== identity || title.length > 300 || /[:#|]/u.test(title) || [...title].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null
    return title
  } catch { return null }
}

export function wikipediaPagePresence(requestedTitle: string, page: Record<string, unknown>) {
  const firstUpper = requestedTitle.slice(0, 1).toUpperCase() + requestedTitle.slice(1)
  if (page.ns !== 0 || page.invalid === true || typeof page.title !== 'string'
    || ![requestedTitle, firstUpper].includes(page.title.normalize('NFC'))) return null
  if (page.missing === true) {
    if (page.pageid !== undefined) return null
    return { result: 'missing' as const, page: { title: page.title, ns: 0, missing: true } }
  }
  if (!Number.isSafeInteger(page.pageid) || Number(page.pageid) < 1) return null
  // A disambiguation page is present, so it can invalidate an older missing
  // observation. Its existence never supplies business identity or prose.
  return { result: 'present' as const, page: { title: page.title, ns: 0, pageid: page.pageid, missing: false } }
}
