import type { ResolveImageUrlOpts } from './resolveImageUrl';

/** News photography is served from our existing mirror, never publisher CDNs.
 * Pending/failed mirrors use the caller's local editorial fallback. In particular,
 * do not hotlink the original while the asynchronous asset query is loading.
 */
export function resolveNewsImage(opts: ResolveImageUrlOpts): string | null {
  const candidates = opts.preferThumb
    ? [opts.thumbnailUrl, opts.optimizedUrl, opts.imageUrl]
    : [opts.optimizedUrl, opts.thumbnailUrl, opts.imageUrl];
  for (const candidate of candidates) {
    if (!candidate || candidate.includes('\\')) continue;
    const localPath = candidate.startsWith('/') && !candidate.startsWith('//');
    try {
      // Parse local paths too: URL normalization can turn /\n/host into //host.
      const url = localPath ? new URL(candidate, 'https://queer.guide') : new URL(candidate);
      if (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.port &&
        ['img.queer.guide', 'queer.guide'].includes(url.hostname)
      )
        return localPath && url.origin === 'https://queer.guide'
          ? `${url.pathname}${url.search}${url.hash}`
          : url.href;
    } catch {
      /* Invalid source: try the next verified mirror. */
    }
  }
  return null;
}
