import { expect, type APIRequestContext } from '@playwright/test';

/**
 * The Supabase anon key for e2e specs that read PostgREST as an anonymous
 * visitor — discovered from the deployed bundle rather than required from the
 * environment.
 *
 * WHY THIS EXISTS. Measured 2026-09-27: **no workflow in this repo sets
 * `VITE_SUPABASE_ANON_KEY`, and it is not a repository secret.** Every spec that
 * read PostgREST as anon therefore opened with
 *
 *     const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
 *     test.skip(!ANON_KEY, 'VITE_SUPABASE_ANON_KEY not set');
 *
 * and that guard fired on every CI run. Ten specs, **45 tests**, reported as
 * skipped rather than failed — a silent pass, which is the exact failure mode
 * this suite is written against: `accessibility-contradictions` (4),
 * `event-merge-redirect` (2), `events-feed-collapse` (3),
 * `events-multiday-overlap` (2), `geo-boundaries` (7),
 * `geo-namesake-city-links` (10), `i18n-content-localisation` (4),
 * `makers-rotation-and-gallery` (6), `safety-note-death-penalty` (4),
 * `venue-merge-redirect` (3).
 *
 * Those 45 include the corpus-wide invariants that exist *because* a
 * subset-sized check once read as the whole: the namesake city-link sweep that
 * pages PostgREST's 1000-row cap through the anon role, the accessibility
 * contradiction sweep, and the death-penalty note check. All were asserting
 * nothing in CI. Measured before this change: with a key supplied, all 45 pass —
 * so nothing was being hidden, but nothing was being checked either.
 *
 * WHY NOT JUST SET THE SECRET. That is the obvious fix and it is still worth
 * doing, but it makes every one of these specs depend on a human having
 * configured a variable, with a silent skip as the failure mode when they have
 * not. Discovery removes the dependency entirely: the key is `VITE_`-prefixed,
 * so Vite inlines it into the client bundle at build time, so it is present on
 * any deployment that works at all. An explicit `VITE_SUPABASE_ANON_KEY` still
 * wins when set, which keeps local runs and non-prod targets working.
 *
 * WHY NOT HARDCODE IT. The anon key is public by design — it ships in the
 * bundle — but a JWT committed to the repo trips the secret scanner that gates
 * this project, and a rotated key would then be wrong in two places.
 *
 * THREE TRAPS, each measured rather than reasoned about:
 *
 *   1. A nonexistent `/assets/**` path is answered with the SPA shell at **HTTP
 *      200** (`public/_redirects` has no catch-all; Pages' built-in fallback
 *      serves index.html). So the response STATUS proves nothing about whether
 *      a chunk is JavaScript — the content-type is what is checked.
 *   2. Chunk names are content-hashed (`client-gq18Mue0.js`), so they are
 *      discovered from index.html rather than guessed.
 *   3. The bundle contains more than one JWT-shaped string. The decoded payload's
 *      `role` is verified to be `anon` before a token is used, so a different
 *      key cannot be picked up by accident.
 *
 * A MISSING KEY IS A FAILURE, NOT A SKIP. That inversion is the whole point of
 * the change: `anonHeaders()` asserts rather than returning something unusable,
 * so a spec can never again quietly do nothing.
 */

/** Resolve once per worker; deferred builds may require following module imports. */
let cached: string | null | undefined;

const MAX_CHUNKS = 64;
const MAX_IMPORT_DEPTH = 4;

function importedChunks(source: string, importer: string): string[] {
  const origin = 'https://e2e-assets.invalid';
  const paths: string[] = [];
  for (const match of source.matchAll(/\b(?:from|import)\s*(?:\(\s*)?["']([^"'\r\n]+)["']/g)) {
    try {
      const url = new URL(match[1], new URL(importer, origin));
      // Follow only module files in this application's asset directory. Never
      // follow external imports, API routes or arbitrary URLs found in a bundle.
      if (url.origin === origin && /^\/assets\/js\/[A-Za-z0-9._-]+\.js$/.test(url.pathname))
        paths.push(url.pathname + url.search);
    } catch {
      // An invalid module specifier cannot help discover the public key.
    }
  }
  return paths;
}

export async function resolveAnonKey(request: APIRequestContext): Promise<string | null> {
  if (cached !== undefined) return cached;
  cached = await discover(request);
  return cached;
}

async function discover(request: APIRequestContext): Promise<string | null> {
  const fromEnv = process.env.VITE_SUPABASE_ANON_KEY;
  if (fromEnv) return fromEnv;

  const index = await request.get('/');
  if (!index.ok()) return null;
  const chunks = [
    ...new Set((await index.text()).match(/\/assets\/js\/[A-Za-z0-9._-]+\.js/g) ?? []),
  ];

  const queue = chunks.map((path) => ({ path, depth: 0 }));
  const seen = new Set<string>();
  while (queue.length && seen.size < MAX_CHUNKS) {
    const { path, depth } = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const res = await request.get(path);
    // Trap 1: a missing asset is answered with the SPA shell at status 200.
    if (!res.ok() || !/javascript/i.test(res.headers()['content-type'] ?? '')) continue;
    const source = await res.text();
    for (const jwt of source.match(
      /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
    ) ?? []) {
      // Trap 3: verify the role rather than trusting the shape.
      if (roleOf(jwt) === 'anon') return jwt;
    }
    if (depth < MAX_IMPORT_DEPTH)
      queue.push(
        ...importedChunks(source, path).map((child) => ({ path: child, depth: depth + 1 })),
      );
  }
  return null;
}

function roleOf(jwt: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(),
    ) as { role?: string };
    return payload.role ?? null;
  } catch {
    // Not a payload we can read — keep looking rather than guessing.
    return null;
  }
}

/**
 * Headers for an anonymous PostgREST read. Fails loudly if the key cannot be
 * resolved, so a spec can never silently assert nothing.
 */
export async function anonHeaders(
  request: APIRequestContext,
): Promise<{ apikey: string; Authorization: string }> {
  const key = await resolveAnonKey(request);
  expect(
    key,
    'could not resolve the anon key from VITE_SUPABASE_ANON_KEY or the deployed bundle — ' +
      'this spec would otherwise silently pass while asserting nothing',
  ).toBeTruthy();
  return { apikey: key!, Authorization: `Bearer ${key!}` };
}

/** The Supabase REST origin, overridable for non-prod targets. */
export const SUPABASE_REST_URL =
  process.env.VITE_SUPABASE_URL ?? 'https://xqeacpakadqfxjxjcewc.supabase.co';
