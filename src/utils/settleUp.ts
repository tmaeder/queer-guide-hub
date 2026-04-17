/**
 * Settle-up math for trip expenses.
 *
 * Each budget item carries `paid_by` (single payer) and `split_among`
 * (uuids sharing the cost equally). We compute a per-user net balance:
 *   paid - owed
 * A positive number means the network owes you; negative means you owe.
 *
 * `suggestSettlements` then greedy-matches the largest creditor with the
 * largest debtor — O(n log n) per group. That isn't always the fewest
 * transfers possible (NP-hard in general), but it hits the minimum for
 * typical trip sizes and is stable / easy to read.
 */

export interface ExpenseItem {
  paid_by: string;
  split_among: string[];
  amount: number;
}

export interface Balance {
  user_id: string;
  net: number;
}

export interface Settlement {
  from_user_id: string;
  to_user_id: string;
  amount: number;
}

/**
 * Convert an amount from one currency to another using `rate_to_usd` quotes
 * (the shape of the `fx_rates` table).
 *
 * Returns `null` when either currency is missing from the rate map — the
 * caller decides whether to drop, warn, or fall back. We never silently
 * use `1.0` as a "fallback rate" because that would lie about the value.
 *
 * `from === to` is a fast-path that skips the rate lookup entirely so a
 * single-currency trip works even before fx_rates is loaded.
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  ratesToUsd: Map<string, number>,
): number | null {
  if (from === to) return amount;
  const fromRate = ratesToUsd.get(from);
  const toRate = ratesToUsd.get(to);
  if (fromRate == null || toRate == null || toRate === 0) return null;
  return amount * (fromRate / toRate);
}

/** In a given currency. Mixing currencies is the caller's problem. */
export function computeBalances(items: ExpenseItem[]): Balance[] {
  const net = new Map<string, number>();

  for (const item of items) {
    if (!item.paid_by || item.amount <= 0) continue;
    const participants = item.split_among.length > 0 ? item.split_among : [item.paid_by];
    const share = item.amount / participants.length;

    net.set(item.paid_by, (net.get(item.paid_by) ?? 0) + item.amount);
    for (const p of participants) {
      net.set(p, (net.get(p) ?? 0) - share);
    }
  }

  const out: Balance[] = [];
  for (const [user_id, raw] of net) {
    // Round to cents so tiny float drift doesn't leave 0.0001 balances.
    const rounded = Math.round(raw * 100) / 100;
    if (rounded !== 0) out.push({ user_id, net: rounded });
  }
  return out;
}

/**
 * Greedy matching. Creditors sorted desc, debtors sorted asc; peel from
 * both ends until everyone is settled (within a 1-cent tolerance).
 */
export function suggestSettlements(balances: Balance[]): Settlement[] {
  const creditors = balances
    .filter((b) => b.net > 0.01)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.net - a.net);
  const debtors = balances
    .filter((b) => b.net < -0.01)
    .map((b) => ({ ...b, net: -b.net }))
    .sort((a, b) => b.net - a.net);

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const give = Math.min(creditors[i].net, debtors[j].net);
    settlements.push({
      from_user_id: debtors[j].user_id,
      to_user_id: creditors[i].user_id,
      amount: Math.round(give * 100) / 100,
    });
    creditors[i].net -= give;
    debtors[j].net -= give;
    if (creditors[i].net < 0.01) i++;
    if (debtors[j].net < 0.01) j++;
  }
  return settlements;
}
