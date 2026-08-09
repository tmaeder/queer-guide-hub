import { describe, it, expect } from 'vitest';
import { entityImageTreatment } from '../imageTreatment';

/**
 * The read side of the hero print treatment.
 *
 * The stakes are asymmetric and that is the whole design: failing to apply riso
 * is a missed flourish, applying it wrongly flattens a rainbow / trans / bi flag
 * into two ink drums and destroys the subject. So every ambiguous input must
 * resolve to 'none', not to a treatment.
 */
describe('entityImageTreatment', () => {
  it('passes through the two known treatments', () => {
    expect(entityImageTreatment({ image_treatment: 'riso' })).toBe('riso');
    expect(entityImageTreatment({ image_treatment: 'halftone' })).toBe('halftone');
  });

  it('treats an unset column and an explicit "none" the same', () => {
    // NULL = never set, 'none' = a human chose off. Both render as no
    // treatment; 'none' exists only because Radix rejects an empty-string
    // SelectItem value, so the admin's clear option needs a real name.
    expect(entityImageTreatment({ image_treatment: null })).toBe('none');
    expect(entityImageTreatment({ image_treatment: 'none' })).toBe('none');
    expect(entityImageTreatment({})).toBe('none');
  });

  it('defaults to none rather than throwing on a missing entity', () => {
    // Detail pages render before their fetch resolves.
    expect(entityImageTreatment(null)).toBe('none');
    expect(entityImageTreatment(undefined)).toBe('none');
  });

  // Typed as a uniform [unknown, string] tuple on purpose. Left inline, the
  // heterogeneous literals widen to a UNION of tuple types
  // ([string, string] | [number, string] | …), and `it.each` then demands a
  // callback assignable to all of them at once — which a single-parameter
  // arrow is not. The ratchet caught exactly that.
  const REFUSED: Array<[unknown, string]> = [
    ['rainbow', 'a value the DB CHECK would reject'],
    ['RISO', 'wrong case'],
    ['', 'empty string from a cleared select'],
    [' riso', 'stray whitespace'],
    [1, 'a number'],
    [true, 'a boolean'],
    [{ nested: 'riso' }, 'an object'],
  ];

  it.each(REFUSED)('refuses %o (%s)', (value, _reason) => {
    expect(entityImageTreatment({ image_treatment: value })).toBe('none');
  });

  it('never returns a treatment the Image primitive cannot render', () => {
    const allowed = new Set(['none', 'riso', 'halftone']);
    for (const v of [null, undefined, '', 'riso', 'halftone', 'x', 0, [], {}]) {
      expect(allowed.has(entityImageTreatment({ image_treatment: v }))).toBe(true);
    }
  });
});
