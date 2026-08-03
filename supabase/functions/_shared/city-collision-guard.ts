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
 * Sentinel: the code means different things in different countries, so on its
 * own it carries no signal. `WA` is Washington and Western Australia; `NT` is
 * Northern Territory and Northwest Territories.
 */
const AMBIGUOUS = '__ambiguous__';

/** Region codes we can expand. US (guard B's vocabulary) plus AU and CA. */
const REGION_BY_ABBR: Record<string, string> = {
  ...US_STATE_BY_ABBR,
  // Australia
  nsw: 'New South Wales', vic: 'Victoria', qld: 'Queensland', tas: 'Tasmania',
  act: 'Australian Capital Territory', sa: 'South Australia',
  // Canada
  ab: 'Alberta', bc: 'British Columbia', mb: 'Manitoba', nb: 'New Brunswick',
  nl: 'Newfoundland and Labrador', ns: 'Nova Scotia', nu: 'Nunavut',
  on: 'Ontario', pe: 'Prince Edward Island', qc: 'Quebec', sk: 'Saskatchewan',
  yt: 'Yukon',
  // Claimed by more than one country — refuse to resolve.
  wa: AMBIGUOUS, nt: AMBIGUOUS,
};

/**
 * Expand a region code so "OR" and "Oregon" compare equal, or return '' when
 * the value carries no comparable signal. The SQL runner compares raw strings,
 * which blocks "OR" vs "Oregon"; expanding is strictly more precise.
 */
export function normalizeRegion(value: string | null | undefined): string {
  const v = (value || '').trim().toLowerCase();
  if (!v) return '';
  const expanded = REGION_BY_ABBR[v];
  if (expanded === AMBIGUOUS) return '';
  return (expanded || v).toLowerCase();
}

/**
 * Guard A only compares region NAMES. Anything else is treated as absence of
 * evidence, because the alternative is refusing correct links: measured across
 * the 114 already-linked events whose `state` disagreed with `cities.region_name`,
 * **113 were false positives** and exactly one was a real mis-link (a Durango,
 * Colorado event attached to Durango, Mexico). The three false-positive shapes:
 *
 *   opaque numeric codes   Melbourne  state "VIC"    vs region_name "07"
 *   unexpanded short codes Byron Bay  state "NSW"    vs region_name "New South Wales"
 *   administrative wording Madrid     state "Madrid" vs region_name "Community of Madrid"
 *
 * So: numeric → no signal; an unrecognized code of ≤3 chars → no signal; and one
 * value containing the other → agreement, not contradiction.
 */
function regionName(value: string | null | undefined): string {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return '';
  if (/^\d+$/.test(raw)) return '';           // "07", "02" — opaque code
  const normalized = normalizeRegion(raw);
  if (!normalized) return '';                 // ambiguous across countries
  if (normalized === raw && raw.length <= 3) return ''; // unknown short code
  return normalized;
}

/** True only when both sides name a region and the names genuinely disagree. */
export function regionsContradict(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = regionName(a);
  const y = regionName(b);
  if (!x || !y || x === y) return false;
  // "madrid" ⊂ "community of madrid", "valencia" ⊂ "valencian community".
  if (x.includes(y) || y.includes(x)) return false;
  return true;
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
 * Guard C — corroboration from prose (the news path).
 *
 * A news article carries neither a `state` column nor a metro slug, so guards A
 * and B have nothing to read. All it has is its own text, and the same collision
 * lands there: of 132 articles linked to Portland, Oregon, 13 name Maine.
 *
 * The obvious rule — "any US state in the text that disagrees with
 * `cities.region_name` blocks the link" — was measured against the live corpus
 * and REJECTED: it fires on 873 of 9,538 US city links, and the sample is
 * overwhelmingly correct links that merely mention another state in passing
 * (a Seattle article referencing Indiana, a SCOTUS roundup listing five states).
 * Blocking those would delete ~9% of a working topical index to fix 13 rows.
 *
 * What actually separates the 13 from the 873 is that **Portland is an ambiguous
 * name and Seattle is not**. So the burden of proof is inverted for ambiguous
 * names only: for those, a state mentioned in the text that is not the
 * candidate's own state refuses the link. Narrowed this way the rule fires on 53
 * of 9,538 links (0.55%), and the blocked set is almost entirely the documented
 * collision pairs — Portland/Maine, Charleston/{SC,WV}, Columbia/SC, Dover/DE,
 * Glendale/AZ, Jackson/MS — plus a few links that were spurious anyway.
 *
 * Consistent with the rest of this module, refusing is the safe direction, and
 * more so here: `news_article_cities` is a topical tag, not an authoritative
 * location, so a missing tag costs far less than a wrong one on a city page.
 */

/**
 * US city names with a well-known twin in another state. `cities` holds at most
 * one row per (name, country) and therefore cannot represent the twin, so this
 * list cannot be derived from the table — its absence IS the bug. Curated, and
 * deliberately short: every entry widens the set of links that need positive
 * corroboration, so add a name only when the twin is prominent enough that
 * articles about it plausibly reach this corpus.
 */
export const AMBIGUOUS_US_CITY_NAMES = new Set([
  'portland', 'charleston', 'springfield', 'columbia', 'columbus', 'wilmington',
  'richmond', 'rochester', 'manchester', 'athens', 'cambridge', 'jackson',
  'franklin', 'aurora', 'glendale', 'lancaster', 'salem', 'newark', 'bristol',
  'dover', 'auburn', 'cleveland', 'alexandria', 'pasadena', 'peoria',
]);

/**
 * `Washington` is excluded from the claimed-state vocabulary entirely. It is
 * simultaneously a state, a city, and the everyday name for the District of
 * Columbia, so a mention corroborates nothing — it produced false blocks on
 * Arlington, Virginia (a DC-metro city) in the measurement.
 */
const PROSE_STATE_NAMES: string[] = [...new Set(Object.values(US_STATE_BY_ABBR))]
  .filter((s) => s !== 'Washington');

const wordRegex = (phrase: string) =>
  new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

/**
 * States the text names, ignoring any whose name is part of the city's own name.
 * Without that exclusion "Kansas City" reads every mention of Kansas as a
 * contradiction of Missouri, which was the single largest false-positive group.
 */
export function claimedStatesFromText(
  text: string | null | undefined,
  cityName: string | null | undefined,
): string[] {
  const body = (text || '').trim();
  if (!body) return [];
  const city = (cityName || '').toLowerCase();
  return PROSE_STATE_NAMES.filter(
    (state) => !city.includes(state.toLowerCase()) && wordRegex(state).test(body),
  );
}

/**
 * Returns a reason when an ambiguously-named city is contradicted by the prose,
 * otherwise null. Naming the candidate's own state anywhere in the text clears
 * it — corroboration outranks a competing mention, so a Portland, Oregon article
 * that also refers to Maine still links.
 */
export function proseStateContradiction(
  city: CollisionCandidate,
  text: string | null | undefined,
): string | null {
  if (!AMBIGUOUS_US_CITY_NAMES.has((city.name || '').trim().toLowerCase())) return null;

  const region = normalizeRegion(city.region_name);
  if (!region) return null; // nothing to corroborate against — guard A's stance

  const claimed = claimedStatesFromText(text, city.name);
  if (claimed.length === 0) return null;
  if (claimed.some((s) => s.toLowerCase() === region)) return null; // corroborated

  return `text names ${claimed.join('/')} but candidate is ${city.name}, ${city.region_name}`;
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
  if (regionsContradict(rowState, city.region_name)) {
    return `state "${rowState}" contradicts candidate ${city.name}, ${city.region_name}`;
  }

  // Guard B: the source metro slug must not contradict the candidate. Unlike
  // guard A this DOES block an uncorroborated claim (empty/opaque region_name):
  // the slug is explicit US-metro evidence, so failing to confirm it is itself
  // a reason not to link.
  const claimed = claimedStateFromMetroSlug(metroSlug, cityText);
  if (claimed && claimed.toLowerCase() !== region) {
    return `source metro "${metroSlug}" claims ${claimed}, candidate is ` +
      `${city.name}, ${city.region_name ?? '(no region)'}`;
  }

  return null;
}
