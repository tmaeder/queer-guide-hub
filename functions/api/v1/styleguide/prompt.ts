/**
 * GET /api/v1/styleguide/prompt — the machine interface to the editorial voice.
 *
 * Serves the published, semver'd system prompt that /admin/styleguide edits and
 * /styleguide renders for humans. External integrations (a self-hosted model, a
 * partner's pipeline, a contributor's script) read it here; Supabase edge
 * functions read the same rows directly through
 * supabase/functions/_shared/voice-style.ts, which is a cheaper hop, not a
 * different source.
 *
 * Query parameters
 *   format   text | json          default json
 *   profile  full | core | compact  default full
 *   v        1.2.0                 pin a version; default is the active one
 *
 * Versions are IMMUTABLE and every profile is frozen into the row at publish
 * time, so a pinned request returns byte-identical text forever. That is the
 * whole reason to pin: a pipeline whose output was validated against v1.2.0
 * should not silently start following an editor's Tuesday afternoon.
 *
 * The content is public — it is an editorial standard, not a secret — so this
 * is anon-readable, CORS-open and CDN-cacheable, keyed by version+profile.
 *
 * FAILURE IS LOUD HERE, unlike branding. A 5xx tells a caller to fall back to
 * its own compiled-in copy. Serving 200 with an empty or stock prompt would
 * make "the styleguide was unreachable" indistinguishable from "the styleguide
 * says nothing", and the second one is a voice silently switched off.
 */
import type { Env } from '../../../_lib/sitemap';

const PROFILES = new Set(['full', 'core', 'compact']);
const SEMVER = /^\d{1,5}\.\d{1,5}\.\d{1,5}$/;

type VersionRow = {
  version?: string;
  compiled_prompt?: string;
  published_at?: string;
  note?: string | null;
  doc?: {
    prompts?: Record<string, string>;
    counts?: Record<string, number>;
    rules?: unknown[];
    terms?: unknown[];
    examples?: unknown[];
  };
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function fail(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS },
  });
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const format = url.searchParams.get('format') === 'text' ? 'text' : 'json';
  const profile = url.searchParams.get('profile') ?? 'full';
  const pin = url.searchParams.get('v');

  if (!PROFILES.has(profile)) {
    return fail(400, `profile must be one of: ${[...PROFILES].join(', ')}`);
  }
  if (pin !== null && !SEMVER.test(pin)) {
    return fail(400, 'v must be a semver version such as 1.0.0');
  }

  const base = env.SUPABASE_URL?.replace(/\/$/, '');
  // The anon key is enough and is the right key: RLS on styleguide_versions
  // already publishes exactly what this endpoint is allowed to serve, so
  // reaching for the service role would only widen what a bug here could leak.
  const key = env.SUPABASE_ANON_KEY;
  if (!base || !key) return fail(503, 'styleguide backend is not configured');

  const filter = pin ? `version=eq.${encodeURIComponent(pin)}` : 'is_active=eq.true';
  const query = `${base}/rest/v1/styleguide_versions?${filter}&select=version,compiled_prompt,doc,published_at,note&limit=1`;

  let rows: VersionRow[];
  try {
    const res = await fetch(query, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return fail(502, `styleguide backend returned ${res.status}`);
    rows = (await res.json()) as VersionRow[];
  } catch {
    return fail(503, 'styleguide backend unreachable');
  }

  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row?.version) {
    return fail(pin ? 404 : 503, pin ? `styleguide version ${pin} not found` : 'no styleguide version is published');
  }

  // Fall back to compiled_prompt only for the default profile: that column IS
  // the full text. For a narrower profile, a missing entry means the version
  // predates profiles, and quietly handing back the full prompt would blow the
  // context budget the caller asked us to respect.
  const prompt = row.doc?.prompts?.[profile] ?? (profile === 'full' ? row.compiled_prompt : undefined);
  if (typeof prompt !== 'string' || prompt.length === 0) {
    return fail(404, `styleguide version ${row.version} has no "${profile}" profile`);
  }

  const headers: Record<string, string> = {
    // Immutable rows, so a pinned request can be cached hard. An unpinned one
    // must revalidate often enough that a publish actually reaches callers.
    'cache-control': pin ? 'public, max-age=86400, immutable' : 'public, max-age=60, s-maxage=300',
    etag: `"sg-${row.version}-${profile}"`,
    'x-styleguide-version': row.version,
    'x-styleguide-profile': profile,
    ...CORS,
  };

  if (request.headers.get('if-none-match') === headers.etag) {
    return new Response(null, { status: 304, headers });
  }

  if (format === 'text') {
    return new Response(prompt, {
      headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return new Response(
    JSON.stringify({
      version: row.version,
      profile,
      published_at: row.published_at ?? null,
      note: row.note ?? null,
      counts: row.doc?.counts ?? null,
      prompt,
      rules: row.doc?.rules ?? [],
      terms: row.doc?.terms ?? [],
      examples: row.doc?.examples ?? [],
    }),
    { headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } },
  );
};
