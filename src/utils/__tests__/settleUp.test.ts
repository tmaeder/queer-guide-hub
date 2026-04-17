import { describe, it, expect } from 'vitest';
import { computeBalances, suggestSettlements, type ExpenseItem } from '@/utils/settleUp';

describe('computeBalances', () => {
  it('handles an empty list', () => {
    expect(computeBalances([])).toEqual([]);
  });

  it('splits a single expense equally', () => {
    const items: ExpenseItem[] = [
      { paid_by: 'a', split_among: ['a', 'b', 'c'], amount: 30 },
    ];
    const balances = computeBalances(items);
    const byUser = Object.fromEntries(balances.map((b) => [b.user_id, b.net]));
    expect(byUser.a).toBe(20);
    expect(byUser.b).toBe(-10);
    expect(byUser.c).toBe(-10);
  });

  it('nets multiple expenses correctly', () => {
    const items: ExpenseItem[] = [
      { paid_by: 'a', split_among: ['a', 'b'], amount: 20 }, // a +10, b -10
      { paid_by: 'b', split_among: ['a', 'b'], amount: 30 }, // b +15, a -15
    ];
    const balances = computeBalances(items);
    const byUser = Object.fromEntries(balances.map((b) => [b.user_id, b.net]));
    expect(byUser.a).toBe(-5);
    expect(byUser.b).toBe(5);
  });

  it('treats empty split_among as payer-only', () => {
    const items: ExpenseItem[] = [
      { paid_by: 'a', split_among: [], amount: 10 },
    ];
    expect(computeBalances(items)).toEqual([]);
  });
});

describe('suggestSettlements', () => {
  it('returns nothing when everyone is even', () => {
    expect(suggestSettlements([])).toEqual([]);
  });

  it('pays off one debt one transfer', () => {
    const balances = [
      { user_id: 'a', net: 10 },
      { user_id: 'b', net: -10 },
    ];
    expect(suggestSettlements(balances)).toEqual([
      { from_user_id: 'b', to_user_id: 'a', amount: 10 },
    ]);
  });

  it('greedy-matches largest debtor to largest creditor', () => {
    const balances = [
      { user_id: 'a', net: 30 },
      { user_id: 'b', net: 10 },
      { user_id: 'c', net: -25 },
      { user_id: 'd', net: -15 },
    ];
    const settlements = suggestSettlements(balances);
    // a is owed 30 → c pays 25, d pays 5; then b owed 10 → d pays 10
    expect(settlements).toHaveLength(3);
    const total = settlements.reduce((s, x) => s + x.amount, 0);
    expect(total).toBe(40);
  });

  it('sums match total creditor balance', () => {
    const balances = [
      { user_id: 'a', net: 12.5 },
      { user_id: 'b', net: 7.5 },
      { user_id: 'c', net: -20 },
    ];
    const out = suggestSettlements(balances);
    const received = new Map<string, number>();
    for (const s of out) {
      received.set(s.to_user_id, (received.get(s.to_user_id) ?? 0) + s.amount);
    }
    expect(received.get('a')).toBe(12.5);
    expect(received.get('b')).toBe(7.5);
  });

  it('ignores sub-cent residuals', () => {
    const balances = [
      { user_id: 'a', net: 0.005 },
      { user_id: 'b', net: -0.005 },
    ];
    expect(suggestSettlements(balances)).toEqual([]);
  });
});
