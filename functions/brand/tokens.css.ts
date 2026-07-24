/**
 * GET /brand/tokens.css — the Brand Token API (stylesheet).
 * Public, CORS-enabled, cached. Fail-open to compiled-in defaults on any error.
 */
import type { Env } from '../_lib/sitemap';
import { getBranding } from '../_lib/branding';
import { resolveTokens, tokensToCss } from '../_lib/brandTokens';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const doc = await getBranding(env).catch(() => null);
  const css =
    '/* Queer Guide design tokens — generated from published branding ⊕ defaults */\n' +
    tokensToCss(resolveTokens(doc));
  return new Response(css, {
    status: 200,
    headers: {
      'Content-Type': 'text/css; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=300, max-age=300',
    },
  });
};
