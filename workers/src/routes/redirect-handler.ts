import type { Env } from '../types';

const ALLOWED_HOSTS = new Set([
  'queer.guide',
  'www.queer.guide',
  'queer-guide.pages.dev',
]);

const DANGEROUS_PROTOCOLS = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'blob:',
  'file:',
]);

interface RedirectData {
  id: string;
  slug: string;
  target: string;
  status_code: number;
  preserve_query: boolean;
  query_mode: string;
  query_override: Record<string, string> | null;
  utm_defaults: Record<string, string> | null;
  click_limit: number | null;
  click_count: number;
}

function validateTarget(target: string): boolean {
  const lower = target.toLowerCase();
  for (const proto of DANGEROUS_PROTOCOLS) {
    if (lower.startsWith(proto)) return false;
  }
  if (target.startsWith('/')) {
    return !target.includes('..') && !target.includes('//');
  }
  try {
    const url = new URL(target);
    return ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function mergeQuery(
  targetUrl: string,
  mode: string,
  incomingQuery: string | null,
  overrides: Record<string, string> | null,
  utmDefaults: Record<string, string> | null,
): string {
  let basePath: string;
  let targetParams: URLSearchParams;

  if (targetUrl.startsWith('http')) {
    const url = new URL(targetUrl);
    basePath = url.origin + url.pathname;
    targetParams = url.searchParams;
  } else {
    const qIdx = targetUrl.indexOf('?');
    if (qIdx >= 0) {
      basePath = targetUrl.substring(0, qIdx);
      targetParams = new URLSearchParams(targetUrl.substring(qIdx + 1));
    } else {
      basePath = targetUrl;
      targetParams = new URLSearchParams();
    }
  }

  if (mode === 'DROP') {
    const qs = targetParams.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const merged = new URLSearchParams(targetParams);

  if (mode === 'PRESERVE' && incomingQuery) {
    const incoming = new URLSearchParams(incomingQuery);
    for (const [key, value] of incoming) {
      if (!merged.has(key)) merged.set(key, value);
    }
  }

  if (mode === 'OVERRIDE' && overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      merged.set(key, value);
    }
    if (incomingQuery) {
      const incoming = new URLSearchParams(incomingQuery);
      for (const [key, value] of incoming) {
        if (!merged.has(key)) merged.set(key, value);
      }
    }
  }

  if (utmDefaults) {
    for (const [key, value] of Object.entries(utmDefaults)) {
      if (!merged.has(key)) merged.set(key, value);
    }
  }

  const qs = merged.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + 'qg-redirect-salt-2026');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 16);
}

function notFoundResponse(slug: string, detail?: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Not Found - Queer Guide</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#e5e5e5}
.c{text-align:center;max-width:400px}.h{font-size:2rem;margin-bottom:.5rem}.s{color:#888;margin-bottom:2rem}
a{color:#a78bfa;text-decoration:none}a:hover{text-decoration:underline}</style></head>
<body><div class="c">
<div class="h">Link not found</div>
<div class="s">The short link <code>/go/${slug}</code> doesn't exist or has expired.${detail ? `<br><small>${detail}</small>` : ''}</div>
<a href="https://queer.guide">Go to Queer Guide</a>
</div></body></html>`;
  return new Response(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}

export async function handleRedirect(
  req: Request,
  env: Env,
): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get('slug')?.toLowerCase().trim();
  const incomingQuery = url.searchParams.get('q') || null;

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Missing slug parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.length < 3 || slug.length > 64) {
    return notFoundResponse(slug);
  }

  // Check KV cache first
  const cached = await env.REDIRECTS.get(slug);
  if (cached === '__404__') return notFoundResponse(slug);
  if (cached) {
    const redirect = JSON.parse(cached) as RedirectData;
    return performRedirect(req, env, redirect, incomingQuery, slug);
  }

  // Fallback: resolve from Supabase RPC
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/resolve_short_redirect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ p_slug: slug }),
    });

    if (!resp.ok) {
      await env.REDIRECTS.put(slug, '__404__', { expirationTtl: 30 });
      return notFoundResponse(slug);
    }

    const data = (await resp.json()) as RedirectData[];
    if (!data || data.length === 0) {
      await env.REDIRECTS.put(slug, '__404__', { expirationTtl: 30 });
      return notFoundResponse(slug);
    }

    const redirect = data[0];
    // Cache in KV for 2 minutes
    await env.REDIRECTS.put(slug, JSON.stringify(redirect), { expirationTtl: 120 });

    return performRedirect(req, env, redirect, incomingQuery, slug);
  } catch (err) {
    console.error('Redirect resolve error:', err);
    return notFoundResponse(slug);
  }
}

async function performRedirect(
  req: Request,
  env: Env,
  redirect: RedirectData,
  incomingQuery: string | null,
  slug: string,
): Promise<Response> {
  if (!validateTarget(redirect.target)) {
    return notFoundResponse(slug, 'Invalid target configuration');
  }

  const finalUrl = mergeQuery(
    redirect.target,
    redirect.query_mode,
    incomingQuery,
    redirect.query_override,
    redirect.utm_defaults,
  );

  if (finalUrl.includes('/go/') || finalUrl.includes('/functions/v1/redirect-handler') || finalUrl.includes('/workers/redirect')) {
    return notFoundResponse(slug, 'Redirect loop detected');
  }

  let locationUrl = finalUrl;
  if (finalUrl.startsWith('/')) {
    locationUrl = `https://queer.guide${finalUrl}`;
  }

  // Record click asynchronously via Supabase (non-blocking)
  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ipHash = await hashIp(ip);

  // Use waitUntil-style: fire and forget the analytics call
  try {
    fetch(`${env.SUPABASE_URL}/rest/v1/rpc/record_redirect_click`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        p_redirect_id: redirect.id,
        p_path: `/go/${slug}`,
        p_query: incomingQuery,
        p_referer: req.headers.get('referer'),
        p_user_agent: req.headers.get('user-agent')?.substring(0, 256),
        p_country: req.headers.get('cf-ipcountry'),
        p_ip_hash: ipHash,
        p_status: redirect.status_code,
      }),
    }).catch(() => {}); // Analytics failure is non-critical
  } catch {
    // Ignore analytics errors
  }

  return new Response(null, {
    status: redirect.status_code,
    headers: {
      Location: locationUrl,
      'Cache-Control': 'no-cache, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
