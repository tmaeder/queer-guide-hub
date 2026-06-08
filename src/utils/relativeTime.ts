/**
 * Compact "time until" label for upcoming events shown on the map.
 * Returns "Soon" / "in 2h" / "Tomorrow" / "in 3d" / "Jun 20", or null for
 * missing/past dates (the map only fetches upcoming events, so past → null).
 */
export function timeUntil(iso: string | undefined | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diffMs = t - now.getTime();
  if (diffMs <= 0) return null;

  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return mins <= 5 ? 'Soon' : `in ${mins}m`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `in ${days}d`;

  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
