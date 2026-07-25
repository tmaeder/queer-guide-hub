/**
 * GET /brand/tokens.json — the Brand Token API (JSON).
 * Public, CORS-enabled, cached. Fail-open to compiled-in defaults on any error.
 */
import type { Env } from '../_lib/sitemap';
import { getBranding } from '../_lib/branding';
import { resolveTokens, tokensToJson } from '../_lib/brandTokens';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const doc = await getBranding(env).catch(() => null);
  const body = JSON.stringify(tokensToJson(resolveTokens(doc)), null, 2);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=300, max-age=300',
    },
  });
};
