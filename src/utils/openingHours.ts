/**
 * Open-now computation for venue `hours` jsonb.
 *
 * The scraper stores a `regular` array of slots shaped
 *   { day: 1-7 (Mon-Sun), open: "HHMM", close: "HHMM" | "+HHMM" }
 * where a `+` prefix on close means the slot runs past midnight into the
 * next day. A precomputed `hours.open_now` also exists but is stale (frozen
 * at scrape time), so we recompute against the viewer's local clock instead.
 */

interface HoursSlot {
  day: number; // 1 = Monday … 7 = Sunday
  open: string; // "HHMM"
  close: string; // "HHMM" or "+HHMM" (past midnight)
}

interface HoursShape {
  display?: string;
  regular?: HoursSlot[];
  open_now?: boolean;
}

/** Parse "HHMM" / "+HHMM" into minutes-from-midnight (close may exceed 1440). */
function toMinutes(raw: string): number | null {
  if (typeof raw !== 'string') return null;
  const overnight = raw.startsWith('+');
  const digits = raw.replace('+', '').padStart(4, '0');
  const h = Number(digits.slice(0, 2));
  const m = Number(digits.slice(2, 4));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m + (overnight ? 24 * 60 : 0);
}

/** JS getDay() (0=Sun..6=Sat) → scraper day (1=Mon..7=Sun). */
function jsDayToSlotDay(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Returns true/false if hours are known, null when there's no usable data.
 * Accepts the raw jsonb value (unknown) so callers don't need to pre-type it.
 */
export function isOpenNow(hours: unknown, now: Date = new Date()): boolean | null {
  if (!hours || typeof hours !== 'object') return null;
  const h = hours as HoursShape;
  const slots = Array.isArray(h.regular) ? h.regular : null;
  if (!slots || slots.length === 0) return null;

  const today = jsDayToSlotDay(now.getDay());
  const yesterday = today === 1 ? 7 : today - 1;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  for (const slot of slots) {
    const open = toMinutes(slot.open);
    const close = toMinutes(slot.close);
    if (open == null || close == null) continue;

    // Same-day slot.
    if (slot.day === today && nowMin >= open && nowMin < close) return true;

    // Overnight slot opened yesterday and still running after midnight.
    if (slot.day === yesterday && close > 24 * 60 && nowMin < close - 24 * 60) {
      return true;
    }
  }
  return false;
}

/** Human-readable hours summary, when the scraper captured one. */
export function hoursDisplay(hours: unknown): string | null {
  if (!hours || typeof hours !== 'object') return null;
  const d = (hours as HoursShape).display;
  return typeof d === 'string' && d.trim() ? d.trim() : null;
}
