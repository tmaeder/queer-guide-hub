import type { SearchFilters } from '@/hooks/useSearch';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/** Today, start to end. */
export function todayRange(now = new Date()): [Date, Date] {
  return [startOfDay(now), endOfDay(now)];
}

/** The coming weekend (Sat–Sun); on a Saturday or Sunday, from today to Sunday. */
export function weekendRange(now = new Date()): [Date, Date] {
  const day = now.getDay(); // 0 Sun … 6 Sat
  const start =
    day === 6 || day === 0
      ? startOfDay(now)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - day));
  const sunday =
    day === 0 ? now : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return [start, endOfDay(sunday)];
}

const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

export function isRange(filters: SearchFilters, range: [Date, Date]): boolean {
  const r = filters.dateRange;
  return !!r && sameDay(r[0], range[0]) && sameDay(r[1], range[1]);
}

/** Price chip ceiling, in the panel's unit (USD). */
export const BUDGET_MAX = 25;
/** "Near me" radius in km. */
export const NEAR_ME_KM = 10;
