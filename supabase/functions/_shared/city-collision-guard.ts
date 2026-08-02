/**
 * Same-name city collision guards.
 *
 * `public.cities` holds at most one row per (name, country), so a US corpus
 * containing Charleston SC *and* Charleston IL can only ever hold one of them.
 * A country + name match therefore proves nothing: an unrepresentable twin
 * looks exactly like an unambiguous name. That is how Portland, Maine resolved
 * to Portland, Oregon; Charleston SC to Charleston IL; Springfield MO to
 * Springfield VT — and then inherited the wrong city's centroid and timezone.
 *
 * Two corroboration guards, mirroring the SQL runner `run_event_city_link`
 * (migration 20260802090844). Either contradiction refuses the link:
 *   A. the row's own `state` vs `cities.region_name`.
 *   B. the gaycities source metro slug, which encodes the state for exactly the
 *      ambiguous names (charlestonsc, springfieldmo, portland-maine).
 *
 * Refusing is the safe direction — a NULL city_id is recoverable, a wrong one
 * is not.
 */

export interface CollisionCandidate {
  name: string;
  region_name: string | null;
}

export const US_STATE_BY_ABBR: Record<string, string> = {
  al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas', ca: 'California',
  co: 'Colorado', ct: 'Connecticut', de: 'Delaware', fl: 'Florida', ga: 'Georgia',
  hi: 'Hawaii', id: 'Idaho', il: 'Illinois', in: 'Indiana', ia: 'Iowa', ks: 'Kansas',
  ky: 'Kentucky', la: 'Louisiana', me: 'Maine', maine: 'Maine', md: 'Maryland',
  ma: 'Massachusetts', mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi',
  mo: 'Missouri', mt: 'Montana', ne: 'Nebraska', nv: 'Nevada', nh: 'New Hampshire',
  nj: 'New Jersey', nm: 'New Mexico', ny: 'New York', nc: 'North Carolina',
  nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma', or: 'Oregon', pa: 'Pennsylvania',
  ri: 'Rhode Island', sc: 'South Carolina', sd: 'South Dakota', tn: 'Tennessee',
  tx: 'Texas', ut: 'Utah', vt: 'Vermont', va: 'Virginia', wa: 'Washington',
  wv: 'West Virginia', wi: 'Wisconsin', wy: 'Wyoming',
};

/**
 * Expand a 2-letter US state code so "OR" and "Oregon" compare equal. The SQL
 * runner compares the raw strings, which blocks that pair; expanding here is
 * strictly more precise and never less safe (it only removes false blocks).
 */
export function normalizeRegion(value: string | null | undefined): string {
  const v = (value || '').trim().toLowerCase();
  if (!v) return '';
  return (US_STATE_BY_ABBR[v] || v).toLowerCase();
}

/**
 * Guard B input: the state a gaycities metro slug claims, or null when the slug
 * carries no recognizable state suffix (e.g. plain "portland", or a non-US
 * metro like "berlin").
 */
export function claimedStateFromMetroSlug(
  subdomain: string | null | undefined,
  cityText: string | null | undefined,
): string | null {
  const sub = (subdomain || '').trim().toLowerCase().replace(/-/g, '');
  const cityNorm = (cityText || '').trim().toLowerCase().replace(/[\s.-]/g, '');
  if (!sub || !cityNorm || !sub.startsWith(cityNorm)) return null;
  return US_STATE_BY_ABBR[sub.slice(cityNorm.length)] || null;
}

/**
 * Returns a human-readable reason when the candidate city contradicts what the
 * row (or its source) claims about the state, otherwise null.
 *
 * A claimed state against an EMPTY `cities.region_name` also blocks: the claim
 * cannot be corroborated, and the whole point is to stop guessing.
 */
export function cityCollisionReason(
  city: CollisionCandidate,
  rowState: string | null | undefined,
  metroSlug: string | null | undefined,
  cityText: string | null | undefined,
): string | null {
  const region = normalizeRegion(city.region_name);

  // Guard A: the row's own state must not contradict the candidate.
  const own = normalizeRegion(rowState);
  if (own && region && own !== region) {
    return `state "${rowState}" contradicts candidate ${city.name}, ${city.region_name}`;
  }

  // Guard B: the source metro slug must not contradict the candidate.
  const claimed = claimedStateFromMetroSlug(metroSlug, cityText);
  if (claimed && claimed.toLowerCase() !== region) {
    return `source metro "${metroSlug}" claims ${claimed}, candidate is ` +
      `${city.name}, ${city.region_name ?? '(no region)'}`;
  }

  return null;
}
