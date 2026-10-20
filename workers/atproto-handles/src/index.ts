export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

const APEX = 'queer.guide';

/** Real queer.guide hosts and service names; mirrors the reserved_usernames rows. */
const RESERVED = new Set(
  'admin api app assets assistant atproto blog bluesky bsky cdn dev docs extract go help img inbox ingest links mail nominatim ntfy search staging status submit team tiles travel trip www'.split(
    ' ',
  ),
);

/** "alice.queer.guide" -> "alice"; anything deeper or foreign -> null. */
export function subdomainOf(host: string): string | null {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!h.endsWith(`.${APEX}`)) return null;
  const sub = h.slice(0, -(APEX.length + 1));
  return /^[a-z0-9]{3,20}$/.test(sub) && !RESERVED.has(sub) ? sub : null;
}

export async function handleRequest(request: Request, env: Env, fetchImpl: typeof fetch = fetch) {
  const url = new URL(request.url);
  if (url.pathname !== '/.well-known/atproto-did')
    return new Response('Not found', { status: 404 });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }
  const sub = subdomainOf(url.hostname);
  if (!sub) return new Response('Not found', { status: 404 });

  const res = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/rpc/atproto_did_for_subdomain`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_sub: sub }),
  });
  if (!res.ok) return new Response('Upstream error', { status: 502 });
  const did = (await res.json()) as string | null;
  if (!did || !/^did:(plc|web):[A-Za-z0-9._:%-]+$/.test(did)) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }
  // Bare DID, text/plain, per the atproto Handle spec.
  return new Response(did, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
};
