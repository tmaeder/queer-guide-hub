import { describe, expect, it } from 'vitest';
import { workBudget, boundedBatch } from '../../supabase/functions/_shared/work-budget.ts';

describe('bounded crawler work', () => {
  it('reserves time to save progress and refuses expired network work', () => {
    let now = 0;
    const budget = workBudget(45000, () => now);
    expect(budget.canStart()).toBe(true);
    now = 30000;
    expect(budget.canStart()).toBe(false);
    now = 45000;
    expect(() => budget.signal()).toThrow('Work budget exhausted');
  });
  it('caps attempted pages and rejects malformed limits', () => {
    expect(boundedBatch(250, 25, 30)).toBe(30);
    expect(boundedBatch(4.9, 25, 30)).toBe(4);
    for (const invalid of [-1, 0, NaN, Infinity, 'oops']) {
      expect(boundedBatch(invalid, 25, 30)).toBe(25);
    }
  });
});
