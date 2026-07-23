/**
 * Serves /manifest.json with site_branding overlays (name, short_name,
 * theme_color, background_color) applied over the static file in public/.
 * Any error passes the static manifest through untouched — the branding
 * layer must never break PWA installability.
 */
import type { Env } from './_lib/sitemap';
import { getBranding, brandingManifest } from './_lib/branding';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const staticRes = await env.ASSETS.fetch(new URL('/manifest.json', request.url).toString());
  try {
    const overlay = brandingManifest(await getBranding(env));
    if (!staticRes.ok || Object.keys(overlay).length === 0) return staticRes;
    const manifest = (await staticRes.clone().json()) as Record<string, unknown>;
    return new Response(JSON.stringify({ ...manifest, ...overlay }), {
      status: 200,
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, s-maxage=300, max-age=300',
      },
    });
  } catch {
    return staticRes;
  }
};
