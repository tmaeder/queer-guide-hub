/**
 * queer-guide extract worker — self-hosted deepcrawl extraction service.
 *
 *   POST /extract  { url, render?:bool, crawl?:bool }
 *     → { url, finalUrl, markdown, meta, links?, method, charCount }
 *   GET  /health   → { ok: true }
 *
 * Internal-only (X-Internal-Secret). Static path: fetch → cheerio main-content →
 * markdown. render:true is reserved for Phase 4 (Cloudflare Browser Rendering)
 * and currently returns 501. See src/deepcrawl/VENDORED.md.
 */
import { cleanHtml } from './clean';
import { hasInternalSecret } from './auth';
import { assertPublicHttpUrl, UnsafeUrlError } from './ssrf';

interface Env {
  INTERNAL_SECRET?: string;
  MAX_HTML_BYTES?: string;
  FETCH_TIMEOUT_MS?: string;
}

const UA = 'Mozilla/5.0 (compatible; QueerGuideBot/1.0; +https://queer.guide/bot)';

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

    if (body.render) {
      // Phase 4 — Cloudflare Browser Rendering binding not yet wired.
      return json({ error: 'render not enabled (phase 4)' }, 501);
    }

    const maxBytes = Number(env.MAX_HTML_BYTES ?? '3000000');
    const timeoutMs = Number(env.FETCH_TIMEOUT_MS ?? '8000');

    try {
      const { html, finalUrl } = await fetchHtml(target, maxBytes, timeoutMs);
      const result = cleanHtml(html, finalUrl, { crawl: body.crawl === true });
      return json({
        url: body.url,
        finalUrl,
        markdown: result.markdown,
        meta: result.meta,
        links: body.crawl ? result.links : undefined,
        method: 'fetch',
        contentMethod: result.contentMethod,
        charCount: result.charCount,
      });
    } catch (e) {
      return json({ error: (e as Error).message, method: 'fetch' }, 502);
    }
  },
};
