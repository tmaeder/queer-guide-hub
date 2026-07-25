/**
 * /brand/tokens.css — the Brand Token API (stylesheet).
 * Public, CORS-enabled, cached. Fail-open to compiled-in defaults on any error.
 * Handles GET (body), HEAD (headers only), and OPTIONS (CORS preflight).
 */
import type { Env } from '../_lib/sitemap';
import { getBranding } from '../_lib/branding';
import { resolveTokens, tokensToCss } from '../_lib/brandTokens';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': '*',
} as const;

const HEADERS = {
  'Content-Type': 'text/css; charset=utf-8',
  'Cache-Control': 'public, s-maxage=300, max-age=300',
  ...CORS,
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const doc = await getBranding(env).catch(() => null);
  const css =
    '/* Queer Guide design tokens — generated from published branding ⊕ defaults */\n' +
    tokensToCss(resolveTokens(doc));
  return new Response(css, { status: 200, headers: HEADERS });
};

export const onRequestHead: PagesFunction<Env> = async () =>
  new Response(null, { status: 200, headers: HEADERS });

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } });
