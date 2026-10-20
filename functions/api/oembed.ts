import type { Env } from '../_lib/sitemap';
import { resolveDetailRoute } from '../_lib/detail';
import { SITE_ORIGIN } from '../_lib/routeMeta';

// oEmbed provider (https://oembed.com) for Queer Guide detail pages. Reuses the
// crawler meta the edge already builds, so title/description/image match the
// page's own Open Graph tags. Only indexable pages are embeddable.
export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  const params = new URL(request.url).searchParams;
  if ((params.get('format') ?? 'json') !== 'json')
    return new Response('Not implemented', { status: 501 });
  let target: URL;
  try {
    target = new URL(params.get('url') ?? '');
  } catch {
    return new Response('Bad url', { status: 400 });
  }
  if (!/^(www\.)?queer\.guide$/.test(target.hostname))
    return new Response('Not found', { status: 404 });
  // Drop an optional /xx or /xx-YY locale prefix.
  const path = target.pathname.replace(/^\/[a-z]{2}(?:-[A-Z]{2})?(?=\/)/, '');
  const detail = await resolveDetailRoute(env, path);
  if (!detail || detail.indexable === false) return new Response('Not found', { status: 404 });
  const body: Record<string, unknown> = {
    version: '1.0',
    type: 'link',
    title: detail.meta.title,
    provider_name: 'Queer Guide',
    provider_url: SITE_ORIGIN,
    cache_age: 3600,
  };
  if (detail.meta.ogImage) body.thumbnail_url = detail.meta.ogImage;
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=3600, max-age=600',
    },
  });
};
