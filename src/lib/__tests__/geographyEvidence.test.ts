import { describe, expect, it } from 'vitest';
import {
  coordinateEvidence,
  matchesName,
  values,
  type WikiEntity,
} from '../../../supabase/functions/geography-verify/evidence';
const item: WikiEntity = {
  id: 'Q1420043',
  labels: { en: { value: 'Shinjuku Ni-chōme' } },
  claims: {
    P625: [
      {
        mainsnak: {
          datavalue: {
            value: {
              latitude: 35.69,
              longitude: 139.70666666667,
              globe: 'http://www.wikidata.org/entity/Q2',
            },
          },
        },
      },
    ],
  },
};
describe('Geographic evidence', () => {
  it('flags the actual Ni-chōme coordinate discrepancy for review', () => {
    const result = coordinateEvidence(item, 35.697627, 139.743214, 1000);
    expect(result.verified).toBe(false);
    expect(result.distance).toBeGreaterThan(3400);
    expect(result.distance).toBeLessThan(3500);
  });
  it('accepts a matching reference pin and rejects missing or ambiguous pins', () => {
    expect(coordinateEvidence(item, 35.69, 139.70667, 1000).verified).toBe(true);
    expect(coordinateEvidence(item, null, 139.70667, 1000).verified).toBe(false);
    expect(
      coordinateEvidence(
        { ...item, claims: { P625: [...item.claims.P625, ...item.claims.P625] } },
        35.69,
        139.70667,
        1000,
      ).verified,
    ).toBe(false);
  });
  it('uses preferred statements and ignores deprecated values', () => {
    const entity = {
      ...item,
      claims: {
        P297: [
          { rank: 'normal', mainsnak: { datavalue: { value: 'XX' } } },
          { rank: 'preferred', mainsnak: { datavalue: { value: 'JP' } } },
          { rank: 'deprecated', mainsnak: { datavalue: { value: 'YY' } } },
        ],
      },
    };
    expect(values(entity, 'P297')).toEqual(['JP']);
  });
  it('requires an exact normalised name or alias, not the first search hit', () => {
    expect(matchesName(item, 'Shinjuku Ni-chome')).toBe(true);
    expect(matchesName(item, 'Shinjuku')).toBe(false);
  });
});
