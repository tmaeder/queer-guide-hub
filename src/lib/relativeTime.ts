// Shared relative-time formatter for news surfaces.
//
// Thin, null-safe wrapper over date-fns so every news card, ticker, feed and
// the masthead render "2h ago" the same way — and so relative time has a single
// place to later localize. Replaces scattered direct formatDistanceToNow calls.
import { formatDistanceToNow } from 'date-fns';

/** Format a timestamp as a relative string like "3 hours ago". Returns '' for missing/invalid input. */
export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return formatDistanceToNow(d, { addSuffix: true });
}
