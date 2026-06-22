/**
 * queer-guide extract worker — self-hosted deepcrawl extraction service.
 *
 *   POST /extract  { url, render?:bool, crawl?:bool }
 *     → { url, finalUrl, markdown, meta, jsonLd, links?, method, charCount }
 *   GET  /health   → { ok: true }
 *
 * Internal-only (X-Internal-Secret). Static path: fetch → cheerio main-content →
 * markdown. render:true uses Cloudflare Browser Rendering (the [browser] binding);
 * it 501s only if that binding isn't provisioned. See src/deepcrawl/VENDORED.md.
 */
import { cleanHtml } from './clean';
import { hasInternalSecret } from './auth';
import { assertPublicHttpUrl, UnsafeUrlError } from './ssrf';
import { renderHtml } from './render';

interface Env {
  INTERNAL_SECRET?: string;
  MAX_HTML_BYTES?: string;
  FETCH_TIMEOUT_MS?: string;
  // Cloudflare Browser Rendering binding (Phase 4). Present only once the
  // [browser] binding is added in wrangler.toml; render:true 501s without it.
  BROWSER?: Fetcher;
}

// Realistic desktop Chrome UA — the bot UA was served degraded/blocked pages by
// many event & venue sites, the most common scan targets. Won't defeat hard bot
// walls (those still fail and surface a clean error to the caller).
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function fetchHtml(
  u: URL,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ html: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
  try {
    const res = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en;q=0.9,de;q=0.8',
      },
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const ct = res.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml|application\/xml|text\/plain/i.test(ct)) {
      throw new Error(`unsupported content-type: ${ct}`);
    }
    // Re-validate the post-redirect host against the SSRF guard.
    const finalUrl = res.url || u.toString();
    assertPublicHttpUrl(finalUrl);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) throw new Error(`html too large: ${buf.byteLength}`);
    return { html: new TextDecoder('utf-8').decode(buf), finalUrl };
  } finally {
    clearTimeout(t);
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true });
    }

    if (req.method !== 'POST' || url.pathname !== '/extract') {
      return json({ error: 'not found' }, 404);
    }

    if (!hasInternalSecret(req, env.INTERNAL_SECRET)) {
      return json({ error: 'unauthorized' }, 401);
    }

    let body: { url?: string; render?: boolean; crawl?: boolean };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid json' }, 400);
    }
    if (!body.url || typeof body.url !== 'string') {
      return json({ error: 'url required' }, 400);
    }

    let target: URL;
    try {
      target = assertPublicHttpUrl(body.url);
    } catch (e) {
      if (e instanceof UnsafeUrlError) return json({ error: e.message }, 400);
      throw e;
    }

    const wantRender = body.render === true;
    if (wantRender && !env.BROWSER) {
      // [browser] binding not provisioned on this deploy.
      return json({ error: 'render not enabled (no BROWSER binding)' }, 501);
    }

    const maxBytes = Number(env.MAX_HTML_BYTES ?? '3000000');
    const timeoutMs = Number(env.FETCH_TIMEOUT_MS ?? '8000');
    const method = wantRender ? 'render' : 'fetch';

    try {
      const { html, finalUrl } = wantRender
        ? await renderHtml(env.BROWSER!, target.toString())
        : await fetchHtml(target, maxBytes, timeoutMs);
      // Re-validate the post-redirect/navigation host against the SSRF guard.
      assertPublicHttpUrl(finalUrl);
      const result = cleanHtml(html, finalUrl, { crawl: body.crawl === true });
      return json({
        url: body.url,
        finalUrl,
        markdown: result.markdown,
        meta: result.meta,
        jsonLd: result.jsonLd,
        links: body.crawl ? result.links : undefined,
        method,
        contentMethod: result.contentMethod,
        charCount: result.charCount,
      });
    } catch (e) {
      if (e instanceof UnsafeUrlError) return json({ error: e.message, method }, 400);
      return json({ error: (e as Error).message, method }, 502);
    }
  },
};
