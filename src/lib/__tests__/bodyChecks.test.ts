import { describe, it, expect } from 'vitest';
import { bodyChecks } from '../bodyChecks';

const fields = (b: Parameters<typeof bodyChecks>[0]) =>
  bodyChecks(b).map((c) => `${c.level}:${c.field}`);

describe('bodyChecks', () => {
  it('passes a consistent profile', () => {
    expect(
      bodyChecks({
        body_type: 'athletic',
        height_cm: 180,
        weight_kg: 78,
        size_top: 'M',
        size_underwear: 'M',
      }),
    ).toEqual([]);
  });
  it('errors only on values the database rejects', () => {
    expect(fields({ height_cm: 90, weight_kg: 400 })).toEqual([
      'error:height_cm',
      'error:weight_kg',
    ]);
  });
  it('hints when the body type and numbers disagree', () => {
    expect(fields({ body_type: 'twink', height_cm: 170, weight_kg: 100 })).toContain(
      'hint:body_type',
    );
    expect(fields({ body_type: 'bear', height_cm: 190, weight_kg: 60 })).toContain(
      'hint:body_type',
    );
  });
  it('hints on sizes far from the weight or from each other', () => {
    expect(fields({ weight_kg: 120, size_top: 'XS' })).toContain('hint:size_top');
    expect(fields({ size_top: 'XS', size_underwear: 'XL' })).toContain('hint:size_underwear');
    expect(fields({ weight_kg: 70, size_top: 'L' })).toEqual([]);
  });
});
