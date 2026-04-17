/**
 * Expiry-status helpers for trip documents.
 *
 * The thresholds reflect what travel-doc handlers usually warn on:
 *   - many countries refuse entry if a passport expires in < 6 months
 *   - 30 days is the "renew now" panic line
 *
 * Pure functions; called from `DocumentsList` to colorize chips and
 * from a future cron to decide push-notification triggers.
 */

export type ExpiryLevel = 'expired' | 'urgent' | 'warning' | 'ok';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExpiryStatus {
  level: ExpiryLevel;
  /** Days until expiry. Negative when already expired. Null when no date. */
  daysRemaining: number | null;
}

export function expiryStatus(
  expiry: string | null | undefined,
  now: Date = new Date(),
): ExpiryStatus {
  if (!expiry) return { level: 'ok', daysRemaining: null };
  const exp = new Date(expiry);
  if (Number.isNaN(exp.getTime())) return { level: 'ok', daysRemaining: null };

  // Compare day-to-day in local time to avoid 23-hour edge cases.
  const expDay = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((expDay - today) / DAY_MS);

  let level: ExpiryLevel;
  if (days < 0) level = 'expired';
  else if (days <= 30) level = 'urgent';
  else if (days <= 180) level = 'warning';
  else level = 'ok';

  return { level, daysRemaining: days };
}

/**
 * Short human-readable label, e.g. "Expires in 12 days", "Expired 3 days ago".
 * Returns null when no expiry is set.
 */
export function expiryLabel(
  status: ExpiryStatus,
  t?: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  if (status.daysRemaining == null) return null;
  const days = status.daysRemaining;

  // Translation function is optional so pure-data callers (cron logic) work.
  const fallback = (key: string, opts?: Record<string, unknown>): string => {
    const count = opts?.count;
    if (key === 'docs.expiry.expiredToday') return 'Expires today';
    if (key === 'docs.expiry.expiredAgo') {
      return `Expired ${count} day${count === 1 ? '' : 's'} ago`;
    }
    if (key === 'docs.expiry.inDays') {
      return `Expires in ${count} day${count === 1 ? '' : 's'}`;
    }
    if (key === 'docs.expiry.inMonths') {
      return `Expires in ${count} month${count === 1 ? '' : 's'}`;
    }
    return '';
  };
  const tx = t ?? fallback;

  if (days === 0) return tx('docs.expiry.expiredToday', { defaultValue: 'Expires today' });
  if (days < 0) {
    return tx('docs.expiry.expiredAgo', {
      count: -days,
      defaultValue: `Expired ${-days} day${days === -1 ? '' : 's'} ago`,
    });
  }
  if (days <= 60) {
    return tx('docs.expiry.inDays', {
      count: days,
      defaultValue: `Expires in ${days} day${days === 1 ? '' : 's'}`,
    });
  }
  const months = Math.round(days / 30);
  return tx('docs.expiry.inMonths', {
    count: months,
    defaultValue: `Expires in ${months} month${months === 1 ? '' : 's'}`,
  });
}
