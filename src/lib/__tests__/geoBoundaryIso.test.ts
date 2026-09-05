import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs operator script, no type declarations
import { isoOf } from '../../../scripts/data-quality/load-geo-boundaries.mjs';

/**
 * Natural Earth's ISO fields do not line up with ISO 3166-1 or with this
 * corpus, and each mismatch below was measured against the real dataset
 * (v5.1.2, 258 admin-0 features) before this test was written.
 *
 * The consequence of getting any of them wrong is not a crash — it is a
 * containment validator that reports correctly-filed venues as country
 * mismatches, which is precisely the failure mode the whole geo cleanup exists
 * to end.
 */
describe('isoOf — Natural Earth ISO-2 normalisation', () => {
  it('maps CN-TW to TW', () => {
    // THE load-bearing case. Natural Earth encodes Taiwan under China's
    // prefix; ISO 3166-1 and this corpus use TW, and 121 venues + 30 events
    // hang off it. Without this mapping all 151 read as country mismatches.
    expect(isoOf({ ISO_A2: 'CN-TW' })).toBe('TW');
  });

  it('treats -99 as absent rather than as a code', () => {
    // 13 admin-0 features carry -99: Somaliland, Northern Cyprus, the Cyprus
    // buffer zone, Guantanamo, Bir Tawil, Siachen and the disputed reefs.
    // Returning null makes the validator DECLINE to adjudicate a venue
    // standing on disputed ground, instead of assigning it to whichever
    // state surrounds it.
    expect(isoOf({ ISO_A2: '-99' })).toBeNull();
    expect(isoOf({ ISO_A2: '-99', ISO_A2_EH: '-99' })).toBeNull();
  });

  it('falls back to ISO_A2_EH when ISO_A2 is missing', () => {
    // The "EH" variant fills some gaps Natural Earth leaves in ISO_A2.
    expect(isoOf({ ISO_A2: '-99', ISO_A2_EH: 'XK' })).toBe('XK');
    expect(isoOf({ ISO_A2_EH: 'NO' })).toBe('NO');
  });

  it('prefers ISO_A2 over the EH variant when both are usable', () => {
    expect(isoOf({ ISO_A2: 'FR', ISO_A2_EH: 'XX' })).toBe('FR');
  });

  it('rejects anything that is not two characters', () => {
    // A 3-letter code would silently never join to countries.code, producing
    // a country with geometry that no venue can ever match.
    expect(isoOf({ ISO_A2: 'FRA' })).toBeNull();
    expect(isoOf({ ISO_A2: '' })).toBeNull();
    expect(isoOf({})).toBeNull();
  });

  it('upper-cases so the join to countries.code cannot miss on case', () => {
    expect(isoOf({ ISO_A2: 'de' })).toBe('DE');
  });
});
