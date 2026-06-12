import { describe, it, expect } from 'vitest';
import {
  BUDGET_PRICE_RANGE,
  budgetLevelForRange,
  accessibilitySlugsFromChips,
  tagsFromChips,
  priceRangeFromChips,
  type PreferenceChip,
} from '../usePreferenceChips';

const chip = (over: Partial<PreferenceChip>): PreferenceChip => ({
  id: 'interest:drag',
  kind: 'interest',
  value: 'drag',
  label: 'drag',
  active: true,
  ...over,
});

describe('budgetLevelForRange', () => {
  it('maps ranges back to budget levels', () => {
    expect(budgetLevelForRange([0, 100])).toBe('budget');
    expect(budgetLevelForRange([0, 300])).toBe('mid_range');
    expect(budgetLevelForRange([300, 1000])).toBe('luxury');
  });

  it('round-trips BUDGET_PRICE_RANGE', () => {
    for (const [level, range] of Object.entries(BUDGET_PRICE_RANGE)) {
      expect(budgetLevelForRange(range)).toBe(level);
    }
  });
});

describe('accessibilitySlugsFromChips', () => {
  it('expands needs to vocab slugs, active chips only', () => {
    const chips = [
      chip({ id: 'accessibility:wheelchair', kind: 'accessibility', value: 'wheelchair' }),
      chip({
        id: 'accessibility:hearing',
        kind: 'accessibility',
        value: 'hearing',
        active: false,
      }),
    ];
    const slugs = accessibilitySlugsFromChips(chips);
    expect(slugs).toContain('wheelchair-accessible');
    expect(slugs).not.toContain('hearing-loop');
  });

  it('passes raw vocab slugs through', () => {
    const chips = [
      chip({ id: 'accessibility:hearing-loop', kind: 'accessibility', value: 'hearing-loop' }),
    ];
    expect(accessibilitySlugsFromChips(chips)).toEqual(['hearing-loop']);
  });
});

describe('tagsFromChips / priceRangeFromChips', () => {
  it('collects active interest values', () => {
    const chips = [chip({}), chip({ id: 'interest:artsy', value: 'artsy', active: false })];
    expect(tagsFromChips(chips)).toEqual(['drag']);
  });

  it('returns the active budget range or null', () => {
    expect(priceRangeFromChips([])).toBeNull();
    expect(
      priceRangeFromChips([
        chip({ id: 'budget:mid_range', kind: 'budget', value: 'mid_range' }),
      ]),
    ).toEqual([0, 300]);
    expect(
      priceRangeFromChips([
        chip({ id: 'budget:mid_range', kind: 'budget', value: 'mid_range', active: false }),
      ]),
    ).toBeNull();
  });
});
