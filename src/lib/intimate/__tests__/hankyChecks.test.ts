import { describe, it, expect } from 'vitest';
import { hankyChecks } from '../hankyChecks';

const base = {
  label: (c: string) => c,
  itemLabel: (s: string) => s,
  rating: () => undefined as string | undefined,
};

describe('hankyChecks', () => {
  it('flags wearing and wanting the same colour in the same pocket, with the fix', () => {
    const [c] = hankyChecks({ ...base, worn: { red: 'left' }, wanted: { red: 'left' } });
    expect(c).toMatchObject({ kind: 'same-pocket', colorId: 'red', fixSide: 'right' });
  });
  it('accepts opposite pockets and "both"', () => {
    expect(hankyChecks({ ...base, worn: { red: 'left' }, wanted: { red: 'right' } })).toEqual([]);
    expect(hankyChecks({ ...base, worn: { red: 'both' }, wanted: { red: 'both' } })).toEqual([]);
  });
  it('flags a worn colour whose item is a hard limit on your side', () => {
    const rating = (slug: string, side: string) =>
      slug === 'anal-fisting' && side === 'giving' ? 'hard_limit' : undefined;
    const checks = hankyChecks({ ...base, rating, worn: { red: 'left' }, wanted: {} });
    expect(checks).toHaveLength(1);
    expect(checks[0].message).toMatch(/hard limit/);
  });
  it('reads a wanted colour from your side: they bottom, so you give', () => {
    const rating = (slug: string, side: string) =>
      slug === 'watersports' && side === 'giving' ? 'no' : undefined;
    expect(hankyChecks({ ...base, rating, worn: {}, wanted: { yellow: 'right' } })).toHaveLength(1);
    expect(hankyChecks({ ...base, rating, worn: {}, wanted: { yellow: 'left' } })).toEqual([]);
  });
});
