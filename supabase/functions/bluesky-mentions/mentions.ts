// Pure helpers for bluesky-mentions: which posts may be stored, and which
// queer.guide links they carry. No network, so they are unit-tested directly.

/** Labels that keep a post out of the rail entirely (Bluesky global values). */
const BLOCKED_LABELS = new Set(['porn', 'sexual', 'nudity', 'graphic-media', 'gore', 'nsfl', '!hide', '!warn'])

// deno-lint-ignore no-explicit-any
export type BskyPostView = any

export function isBlocked(post: BskyPostView): boolean {
  const vals = [
    ...(post.labels ?? []),
    ...(post.author?.labels ?? []),
    ...(post.record?.labels?.values ?? []),
  ].map((l: { val?: string }) => l?.val)
  return vals.some((v) => v && BLOCKED_LABELS.has(v))
}

/** Every queer.guide path the post links to: link card, link facets, bare URLs in text. */
export function queerGuidePaths(post: BskyPostView): string[] {
  const urls: string[] = []
  const rec = post.record ?? {}
  if (rec.embed?.external?.uri) urls.push(rec.embed.external.uri)
  if (rec.embed?.media?.external?.uri) urls.push(rec.embed.media.external.uri)
  for (const f of rec.facets ?? []) for (const feat of f.features ?? []) if (feat.uri) urls.push(feat.uri)
  for (const m of String(rec.text ?? '').matchAll(/https?:\/\/(?:www\.)?queer\.guide\/\S+/g)) urls.push(m[0])
  const out = new Set<string>()
  for (const u of urls) {
    try {
      const url = new URL(u)
      if (url.hostname === 'queer.guide' || url.hostname === 'www.queer.guide') out.add(url.pathname.replace(/\/+$/, ''))
    } catch { /* not a URL */ }
  }
  return [...out]
}

/** A title match must contain the whole title, not just share words with it. */
export function quotesTitle(post: BskyPostView, title: string): boolean {
  const norm = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ')
  return norm(String(post.record?.text ?? '')).includes(norm(title))
}

export function toRow(post: BskyPostView, entity_type: string, entity_id: string, match_kind: 'link' | 'title') {
  return {
    at_uri: post.uri,
    cid: post.cid ?? null,
    entity_type,
    entity_id,
    author_did: post.author.did,
    author_handle: post.author.handle,
    author_name: post.author.displayName || null,
    author_avatar: post.author.avatar || null,
    text: String(post.record?.text ?? '').slice(0, 3000),
    post_created_at: post.record?.createdAt ?? post.indexedAt ?? null,
    match_kind,
  }
}
