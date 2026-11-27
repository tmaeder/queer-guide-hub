import {
  VENUES_FEATURED_LIMIT,
  VENUES_HERO_META_NAME,
  VENUES_HERO_SIZES,
  VENUES_HERO_WIDTHS,
} from '../../src/components/venues/venuesHeroImage';
import {
  isVenueHeroEligible,
  venueHeroPhoto,
  type VenueHeroCandidate,
} from '../../src/components/venues/venuesHeroPool';
import { attr, heroImagePreload } from './heroPreload';

/**
 * Preload for the featured-venue hero on /venues, the page's LCP element.
 *
 * Lighthouse mobile (2026-11-20) put ~13 s of the /venues LCP (17.4 s) in
 * "load delay": the hero photo is only requested after the JS graph has loaded,
 * the featured query has returned and React has rendered VenuesHero.
 *
 * The hero rotates and opens on a random slide, so the edge cannot guess which
 * photo the page will show. Instead the edge makes the choice: it picks a
 * random eligible featured venue, preloads its photo, and names it in
 * `<meta name="qg-venues-hero">`. VenuesHero opens on that venue when it is in
 * its own pool, and falls back to a random slide when it is not. The first
 * venue still differs between visits.
 *
 * The pool is the same query useFeaturedVenues runs, read with the anon key so
 * row-level security matches a signed-out visitor, and filtered by the same
 * isVenueHeroEligible the component uses.
 */

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export interface VenuesHeroHead {
  /** `<link rel="preload" as="image">`, for right after `<meta charset>`. */
  preload: string;
  /** `<meta name="qg-venues-hero" content="<venue id>">`. */
  meta: string;
}

// Same bounds as branding.ts: a loading hint may never hold up the page.
const TTL_MS = 60_000;
const FAILURE_TTL_MS = 10_000;
const FETCH_TIMEOUT_MS = 800;

let memo: { pool: VenueHeroCandidate[]; expiresAt: number } | null = null;

/** Test hook: forget the in-isolate pool. */
export function resetVenuesHeroPoolForTests(): void {
  memo = null;
}

/** The featured query useFeaturedVenues runs, as a PostgREST URL. */
export function featuredVenuesUrl(supabaseUrl: string): string {
  const params = new URLSearchParams({
    select: 'id,images,safety_gated,closure_status,closed_at',
    is_featured: 'eq.true',
    data_source: 'neq.refuge-restrooms',
    review_status: 'neq.archived',
    duplicate_of_id: 'is.null',
    images: 'not.is.null',
    order: 'updated_at.desc',
    limit: String(VENUES_FEATURED_LIMIT),
  });
  return `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/venues?${params.toString()}`;
}

async function featuredPool(env: Env): Promise<VenueHeroCandidate[]> {
  const now = Date.now();
  if (memo && memo.expiresAt > now) return memo.pool;
  const lastKnown = memo?.pool ?? [];
  const remember = (pool: VenueHeroCandidate[], ttl: number) => {
    memo = { pool, expiresAt: Date.now() + ttl };
    return pool;
  };
  // Anon key only: the service role would bypass RLS and see a different
  // first 12 rows than a signed-out visitor's browser does.
  const key = env.SUPABASE_ANON_KEY;
  if (!env.SUPABASE_URL || !key) return remember(lastKnown, FAILURE_TTL_MS);
  try {
    const res = await fetch(featuredVenuesUrl(env.SUPABASE_URL), {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return remember(lastKnown, FAILURE_TTL_MS);
    const rows = (await res.json()) as VenueHeroCandidate[];
    return remember(Array.isArray(rows) ? rows.filter(isVenueHeroEligible) : [], TTL_MS);
  } catch {
    return remember(lastKnown, FAILURE_TTL_MS);
  }
}

/** The preload + meta for one pick from `pool`, or null if none can preload. */
export function venuesHeroHeadFor(
  pool: VenueHeroCandidate[],
  random: () => number = Math.random,
): VenuesHeroHead | null {
  // Only venues whose photo can be resized are preloadable; choosing among
  // those keeps the pick and the preload one decision.
  const preloadable = pool
    .map((v) => ({
      v,
      tag: heroImagePreload(venueHeroPhoto(v), VENUES_HERO_SIZES, VENUES_HERO_WIDTHS),
    }))
    .filter((x): x is { v: VenueHeroCandidate; tag: string } => x.tag !== null);
  if (preloadable.length === 0) return null;
  const { v, tag } = preloadable[Math.floor(random() * preloadable.length) % preloadable.length];
  return { preload: tag, meta: `<meta name="${VENUES_HERO_META_NAME}" content="${attr(v.id)}">` };
}

/**
 * Whether a /venues request will render the hero. VenuesHero only shows with
 * no filters, the grid view and the default sort, all of which live in the
 * query string, so any parameter other than tracking tags skips the preload.
 */
export function rendersVenuesHero(basePath: string, search: URLSearchParams): boolean {
  if (basePath !== '/venues') return false;
  for (const key of search.keys()) {
    if (!key.startsWith('utm_')) return false;
  }
  return true;
}

export async function venuesHeroHead(env: Env): Promise<VenuesHeroHead | null> {
  return venuesHeroHeadFor(await featuredPool(env));
}
