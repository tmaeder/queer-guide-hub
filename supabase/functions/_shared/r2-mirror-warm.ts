/**
 * Copy freshly ingested images into R2 straight away, by asking the image-cdn
 * pull-through for each one (`img.queer.guide/r/<base64url(source)>`, HEAD — a
 * miss makes the worker fetch and store it, no body comes back).
 *
 * Why at ingest: some sources hand out image links that expire within days
 * (QueerCalendar's Instagram CDN URLs carry a signed `oe=` deadline), which the
 * weekly bulk copy (scripts/data-quality/warm-r2-images.mjs) would miss. The
 * encoding must match src/utils/imageHost.ts `toR2ImageUrl`.
 */
const R2_REMOTE = 'https://img.queer.guide/r/';
const MAX_IMAGES = 300;
const CONCURRENCY = 8;

export function r2RemoteUrl(src: string): string | null {
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.hostname === 'img.queer.guide') return null;
  const bytes = new TextEncoder().encode(u.href);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return R2_REMOTE + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function warmImagesInR2(urls: Iterable<string>, fetcher: typeof fetch = fetch): Promise<number> {
  const targets = [...new Set([...urls].map(r2RemoteUrl).filter((u): u is string => !!u))].slice(0, MAX_IMAGES);
  let ok = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
      while (next < targets.length) {
        const target = targets[next++];
        try {
          const res = await fetcher(target, { method: 'HEAD', signal: AbortSignal.timeout(20_000) });
          if (res.ok) ok++;
        } catch {
          // best effort — the weekly bulk copy and first view are the fallbacks
        }
      }
    }),
  );
  return ok;
}

/** Run in the background when the edge runtime allows it, so staging never waits on images. */
export function warmImagesInBackground(urls: Iterable<string>): void {
  const job = warmImagesInR2(urls).catch(() => 0);
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  runtime?.waitUntil(job);
}
