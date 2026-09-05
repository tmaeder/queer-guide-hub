// P3 POI join — the matching decision, as pure functions.
//
// Everything here is measured. `docs/audits/2026-09-04-poi-match-rate-measurement.md`
// replayed the deployed per-venue rule against bulk extracts of Germany's 1,648
// coordinate-bearing venues and hand-read 116 matches one at a time. The tiers
// below are exactly the ones that survived that read, and the ones that did not
// are absent ON PURPOSE — see REJECTED at the bottom.
//
// Kept free of I/O so it can be unit-tested; the driver (poi-match.mjs) owns
// every fetch and every write.

/**
 * Mirror of `normalizeName` in supabase/functions/_shared/venue-pipeline-utils.ts.
 * Must stay byte-identical in behaviour: the whole point of tier 1 is that it is
 * the SAME test the production matcher applies, so the 20.6% baseline and the
 * 48% result are comparable rather than two different experiments.
 */
export function normalizeName(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Mirror of public.dedup_despace — strips ALL non-alphanumerics, spaces included. */
export function despace(raw) {
  return normalizeName(raw).replace(/[^a-z0-9]/g, '');
}

/**
 * Mirror of public.dedup_core_tokens(name, city). The stop list is copied from
 * 20260623150504_unified_dedup_name_keys.sql and must not drift: it is what
 * makes 'BOILER Sauna Berlin' and 'Boiler' the same key in Berlin.
 */
const GENERIC_TOKENS = new Set([
  'the', 'a', 'an', 'and', 'of', 'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'und',
  'le', 'la', 'les', 'el', 'los', 'las', 'il', 'lo', 'un', 'une', 'di', 'da',
  'bar', 'club', 'pub', 'lounge', 'bistro', 'sauna', 'spa', 'cafe', 'coffee', 'kaffee',
  'restaurant', 'hotel', 'hostel', 'inn', 'disco', 'disko', 'nightclub', 'kino', 'cinema',
  'shop', 'store', 'sex', 'gay', 'lgbt', 'lgbtq', 'queer', 'mens', 'boys',
]);

export function coreTokens(name, city) {
  const cityTokens = new Set(normalizeName(city).split(' ').filter(Boolean));
  const seen = new Set();
  for (const t of normalizeName(name).split(' ')) {
    if (!t || GENERIC_TOKENS.has(t) || cityTokens.has(t)) continue;
    seen.add(t);
  }
  return [...seen].sort();
}

/** Mirror of public.haversine_m. Metres. */
export function haversineM(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * REMOVED: a name-shaped "this row is not a venue" suppressor.
 *
 * It was built, run against Germany, and MEASURED — and the measurement killed
 * it. Markers like `e.V.`, `GmbH`, `c/o` and `Festival` suppressed 132 of 1,574
 * venues, of which only 12 could match anything at all. Reading those 12: four
 * were real venues the guard would have silently denied — `C/O Berlin` (a major
 * photography gallery, whose NAME the `c/o` pattern matched), `Böse Buben e.V.`
 * (a Berlin bar), `Kommunales Kino Esslingen e.V.` (a cinema) and `Forum
 * Queeres Archiv München e.V.`. German venues carry legal suffixes as a matter
 * of course, so `e.V.`/`GmbH` select for German-ness, not for non-venue-ness.
 *
 * The deeper reason it is not needed: the failure it was built to prevent — an
 * organisation matched to the venue that HOSTS it ('XPOSED Film Festival c/o
 * Moviemento' -> 'Moviemento') — is an artefact of token-SUBSET matching, and
 * tier 4 is not implemented. Under full-name, de-spaced or whole-core-token
 * equality a festival cannot match its host: the names are not equal.
 *
 * Rows that genuinely are not venues are excluded by the corpus's own signals,
 * which the driver applies (`review_status='archived'`, and
 * `enrichment_status.nonvenue_candidate.status='confirmed'`). Fixing the rest is
 * the `nonvenue_candidate` split, which the audit recommends sequencing before
 * this join — a classification problem, not a regex.
 */

/**
 * Which name rule, if any, links this venue to this POI.
 * 1 = exact normalised name (production's own test, against every name variant
 *     the source publishes: name, name:en, alt_name, old_name, short_name, brand)
 * 2 = identical de-spaced name  ('Lab.Oratory' = 'Laboratory')
 * 3 = identical core tokens     ('Boiler' = 'BOILER Sauna Berlin')
 * null = no link.
 *
 * Tier 4 (token SUBSET) is deliberately absent — see REJECTED.
 */
export function nameTier(venue, poi) {
  const variants = poi.variants?.length ? poi.variants : [normalizeName(poi.name)];
  if (venue.nn && variants.includes(venue.nn)) return 1;
  // >= 4 chars mirrors the SQL guard: shorter de-spaced keys collide freely.
  if (venue.dsp.length >= 4 && despace(poi.name) === venue.dsp) return 2;
  if (venue.core.length >= 1) {
    const pc = coreTokens(poi.name, venue.city);
    if (pc.length === venue.core.length && pc.every((t, i) => t === venue.core[i])) return 3;
  }
  return null;
}

/**
 * Precompute the venue-side keys once; the driver holds thousands of these.
 *
 * The coordinate assertion is not defensive padding. `latitude`/`longitude` as
 * PostgREST returns them are not the `lat`/`lon` this module reads, and the
 * mismatch does not throw — it makes every haversine NaN, every `dist > radius`
 * false, and every venue report `no_match`. That is indistinguishable from "the
 * source does not have these venues", which is the exact shape of wrong answer
 * this whole programme exists to stop shipping.
 */
export function venueKeys(venue) {
  if (!Number.isFinite(venue.lat) || !Number.isFinite(venue.lon)) {
    throw new Error(
      `venueKeys: venue ${venue.id} has non-finite coordinates (lat=${venue.lat}, lon=${venue.lon}). ` +
        'Map latitude/longitude to lat/lon at the API boundary.',
    );
  }
  return {
    ...venue,
    nn: normalizeName(venue.name),
    dsp: despace(venue.name),
    core: coreTokens(venue.name, venue.city),
  };
}

export const DEFAULT_RADIUS_M = 250;
/** Two POIs with the same name closer than this are one place mapped twice. */
export const SAME_PLACE_M = 120;

/**
 * Resolve one venue against its nearby candidates.
 *
 * The ambiguity guard is the production rule and is NOT negotiable: two
 * same-named candidates BLOCK and write nothing. It is scoped to the best tier
 * present, because a venue that matches one POI exactly and another only by
 * shared tokens is not ambiguous — the exact match wins outright.
 *
 * Candidates that share a normalised name AND sit within SAME_PLACE_M of each
 * other are collapsed to one place first: OSM routinely carries a venue as both
 * a node and a building way, and blocking on that would refuse the commonest
 * correct match in the corpus.
 */
export function resolveVenue(venue, candidates, opts = {}) {
  const radiusM = opts.radiusM ?? DEFAULT_RADIUS_M;

  // Trap 3 of scripts/data-quality/overture-category-match.md: a name that
  // normalises to fewer than 3 characters matches everything. Cyrillic and CJK
  // names normalise to empty, and empty == empty.
  if (venue.nn.length < 3) {
    return { verdict: 'skipped', reason: 'normalised_name_too_short' };
  }

  const scored = [];
  for (const p of candidates) {
    const dist = haversineM(venue.lat, venue.lon, p.lat, p.lon);
    if (dist > radiusM) continue;
    const tier = nameTier(venue, p);
    if (tier === null) continue;
    scored.push({ ...p, dist, tier });
  }
  if (scored.length === 0) return { verdict: 'no_match' };

  const bestTier = Math.min(...scored.map((c) => c.tier));
  const top = scored.filter((c) => c.tier === bestTier);

  // Collapse same-name candidates that are the same physical place.
  const byName = new Map();
  for (const c of top) {
    const key = normalizeName(c.name);
    const g = byName.get(key);
    if (!g) byName.set(key, [c]);
    else g.push(c);
  }
  const places = [];
  for (const group of byName.values()) {
    group.sort((a, b) => a.dist - b.dist);
    const spread = Math.max(
      ...group.map((a) => Math.max(...group.map((b) => haversineM(a.lat, a.lon, b.lat, b.lon)))),
    );
    if (spread > SAME_PLACE_M) {
      // Same name, far apart: two different places. Each counts separately, so
      // this correctly becomes an ambiguity rather than a nearest-wins pick.
      for (const c of group) places.push(c);
    } else {
      places.push(group[0]);
    }
  }

  if (places.length > 1) {
    places.sort((a, b) => a.dist - b.dist);
    return {
      verdict: 'blocked',
      reason: 'ambiguous_same_name_candidates',
      candidates: places.slice(0, 4).map((c) => ({ ext_id: c.ext_id, name: c.name, dist: Math.round(c.dist) })),
    };
  }
  return { verdict: 'match', tier: bestTier, match: places[0] };
}

// ---------------------------------------------------------------------------
// REJECTED — measured and deliberately not implemented. Re-adding any of these
// needs a NEW precision measurement on a fresh sample, not a tuned threshold.
//
// * Token SUBSET (one name's tokens contained in the other's). Lifts Germany's
//   union recall 48.0% -> 60.4%, and its errors are systematic rather than
//   random: it is the arm that matches a festival to its host cinema. The
//   independent cross-source signal agrees — where both sources match a venue,
//   they agree on WHICH POI 100% of the time at tier 1, 79.8% at tier 3, and
//   only 55.5% once subsets are allowed.
// * Exact name anywhere within 25 km, for the centroid-geocoded cohort (8% of
//   Germany, 23% of Switzerland). Scored 60% / 37.5% precision on its increment:
//   it returned an artwork 22 km away for 'Sechserbrücke' and a takeaway for
//   'Metropol'. Its real value is the opposite of enrichment — an identical
//   website 8 km from our stored coordinate means OUR coordinate is wrong, which
//   belongs in a geo-repair review queue, never in an auto-fill.
// * Radius beyond 250 m. At 250 m OSM already offers `tourism=information` (a
//   signpost ABOUT the venue) and `amenity=parking_entrance` (its car park) as
//   sole same-named candidates, which the ambiguity guard cannot catch.
