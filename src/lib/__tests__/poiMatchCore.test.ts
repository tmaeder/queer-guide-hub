import { describe, expect, it } from 'vitest';

// Kept on ONE line: `@ts-expect-error` suppresses the next LINE, and TS7016 for
// an untyped .mjs is reported at the module specifier. Same shape as
// recoverMigrationDrift.test.ts, for the same reason.
// @ts-expect-error — .mjs script lib, no type declarations
import { coreTokens, despace, nameTier, normalizeName, resolveVenue, venueKeys } from '../../../scripts/data-quality/lib/poi-match-core.mjs';

/**
 * The P3 matcher's decision rules.
 *
 * Every number these tests pin comes from
 * `docs/audits/2026-09-04-poi-match-rate-measurement.md`, which hand-read 116
 * matches. The tests that matter most are the NEGATIVE ones: the tiers that
 * measurement rejected must stay rejected, because re-adding them is a one-line
 * change that raises recall and quietly costs precision.
 */

const V = (name: string, lat = 52.5, lon = 13.4, city = 'Berlin') =>
  venueKeys({ id: 'v1', name, lat, lon, city });

/** ~metres east at Berlin's latitude. */
const east = (lon: number, m: number) => lon + m / (111320 * Math.cos((52.5 * Math.PI) / 180));

describe('name keys mirror the production SQL', () => {
  it('normalizeName strips accents and punctuation without eating letters', () => {
    // Regression: an over-broad combining-mark class ate the `f` in "Café",
    // which would have silently changed every tier-1 decision in the corpus.
    expect(normalizeName('Café Bar')).toBe('cafe bar');
    expect(normalizeName('Möbel Olfe')).toBe('mobel olfe');
    expect(normalizeName('Lab.Oratory')).toBe('lab oratory');
    expect(normalizeName(null)).toBe('');
  });

  it('despace mirrors dedup_despace', () => {
    expect(despace('Lab.Oratory')).toBe('laboratory');
    expect(despace('Laboratory')).toBe('laboratory');
  });

  it('coreTokens drops generic and city words, like dedup_core_tokens', () => {
    expect(coreTokens('BOILER Sauna Berlin', 'Berlin')).toEqual(['boiler']);
    expect(coreTokens('Boiler', 'Berlin')).toEqual(['boiler']);
    // Sorted + de-duplicated, so equality is order-independent.
    expect(coreTokens('Zum Schmutzigen Hobby', 'Berlin')).toEqual(['hobby', 'schmutzigen', 'zum']);
  });
});

describe('tiering', () => {
  it('matches an exact normalised name through any published variant', () => {
    expect(nameTier(V('Möbel Olfe'), { name: 'Moebel Olfe', variants: ['moebel olfe', 'mobel olfe'] })).toBe(1);
  });

  it('falls back to de-spaced equality', () => {
    expect(nameTier(V('Lab.Oratory'), { name: 'Laboratory', variants: ['laboratory'] })).toBe(2);
  });

  it('falls back to core-token equality', () => {
    expect(nameTier(V('Boiler'), { name: 'BOILER Sauna Berlin', variants: ['boiler sauna berlin'] })).toBe(3);
  });

  it('does NOT match on a token subset — the rejected tier', () => {
    // Measured: this arm is what matched a festival to its host cinema, and it
    // drops cross-source agreement from 79.8% to 55.5%. If this test starts
    // failing, someone re-added tier 4; re-measure precision before keeping it.
    expect(nameTier(V('XPOSED Film Festival'), { name: 'Moviemento', variants: ['moviemento'] })).toBeNull();
    expect(nameTier(V('Rosa'), { name: 'Rosa Parks Bakery', variants: ['rosa parks bakery'] })).toBeNull();
  });
});

describe('resolveVenue', () => {
  const poi = (name: string, lat: number, lon: number, ext_id = `node/${name}`) => ({
    ext_id, name, lat, lon, variants: [normalizeName(name)],
  });

  it('matches a single exact candidate inside the radius', () => {
    const r = resolveVenue(V('Möbel Olfe'), [poi('Möbel Olfe', 52.5001, 13.4001)]);
    expect(r.verdict).toBe('match');
    expect(r.tier).toBe(1);
  });

  it('finds nothing beyond 250 m', () => {
    // ~400 m east — past the radius the audit fixed, where OSM starts offering
    // the venue's car park and its information signpost as sole candidates.
    const r = resolveVenue(V('Möbel Olfe'), [poi('Möbel Olfe', 52.5, east(13.4, 400))]);
    expect(r.verdict).toBe('no_match');
  });

  it('collapses a node and its building way into ONE match', () => {
    // The commonest correct shape in OSM. Blocking on it would refuse most of
    // the corpus, so this is the case the ambiguity guard must NOT fire on.
    const r = resolveVenue(V('SchwuZ'), [
      poi('SchwuZ', 52.5, 13.4, 'node/1'),
      poi('SchwuZ', 52.50018, 13.4, 'way/2'), // ~20 m apart
    ]);
    expect(r.verdict).toBe('match');
    expect(r.match.ext_id).toBe('node/1');
  });

  it('BLOCKS two same-named candidates that are genuinely different places', () => {
    const r = resolveVenue(V('Aroma'), [
      poi('Aroma', 52.5, 13.4, 'node/1'),
      poi('Aroma', 52.5, east(13.4, 200), 'node/2'), // 200 m > SAME_PLACE_M
    ]);
    expect(r.verdict).toBe('blocked');
    expect(r.reason).toBe('ambiguous_same_name_candidates');
  });

  it('BLOCKS two differently-named candidates that tie at the same tier', () => {
    const r = resolveVenue(V('Boiler'), [
      poi('Boiler Sauna', 52.5001, 13.4),
      poi('Boiler Club', 52.5002, 13.4),
    ]);
    expect(r.verdict).toBe('blocked');
  });

  it('prefers an exact match over a weaker one rather than calling it ambiguous', () => {
    // Ambiguity is scoped to the BEST tier present. An exact name plus a
    // core-token near-miss is not a tie.
    const r = resolveVenue(V('Boiler'), [
      poi('Boiler', 52.5001, 13.4, 'node/exact'),
      poi('Boiler Sauna Berlin', 52.5002, 13.4, 'node/tokens'),
    ]);
    expect(r.verdict).toBe('match');
    expect(r.tier).toBe(1);
    expect(r.match.ext_id).toBe('node/exact');
  });

  it('does NOT suppress a venue for carrying a legal suffix or a c/o in its name', () => {
    // Regression on a guard that was built, measured against Germany, and
    // removed. It skipped 132 of 1,574 venues; of the 12 that could match,
    // four were real places — including `C/O Berlin`, a photography gallery
    // whose actual name a `c/o` pattern matches. German venues carry `e.V.`
    // and `GmbH` routinely, so those markers select for German-ness.
    for (const name of ['C/O Berlin', 'Böse Buben e.V.', 'Kommunales Kino Esslingen e.V.']) {
      const r = resolveVenue(V(name), [poi(name, 52.5001, 13.4)]);
      expect(r.verdict).toBe('match');
    }
  });

  it('cannot match an organisation to the venue that hosts it', () => {
    // The failure the removed guard existed to prevent. It is structurally
    // impossible without token-SUBSET matching, which is not implemented — the
    // names are simply not equal under any of the three tiers.
    const r = resolveVenue(V('XPOSED Film Festival c/o Moviemento'), [poi('Moviemento', 52.5001, 13.4)]);
    expect(r.verdict).toBe('no_match');
  });

  it('skips a name too short to be discriminating', () => {
    // jaro/equality on a 2-character key matches far too much; the Overture
    // runbook hit the degenerate form of this where '' === ''.
    const r = resolveVenue(V('Ku'), [poi('Ku', 52.5, 13.4)]);
    expect(r.verdict).toBe('skipped');
    expect(r.reason).toBe('normalised_name_too_short');
  });
});
