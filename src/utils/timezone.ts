/**
 * Timezone Utilities
 *
 * Provides timezone-aware date/time formatting using the Intl API.
 * Works with IANA timezone identifiers (e.g. "America/New_York").
 */

/**
 * Format a UTC ISO string into a localized time string in the given IANA timezone.
 * Falls back to browser local timezone if tz is null/undefined/invalid.
 */
export function formatTimeInZone(
  isoDate: string,
  tz?: string | null,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(isoDate);
  const defaults: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  };

  try {
    if (tz) {
      return date.toLocaleTimeString('en-US', { ...defaults, timeZone: tz });
    }
  } catch {
    // Invalid timezone — fall through to browser default
  }
  return date.toLocaleTimeString('en-US', defaults);
}

/**
 * Format a UTC ISO string into a localized date string in the given IANA timezone.
 */
export function formatDateInZone(
  isoDate: string,
  tz?: string | null,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(isoDate);
  const defaults: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  };

  try {
    if (tz) {
      return date.toLocaleDateString('en-US', { ...defaults, timeZone: tz });
    }
  } catch {
    // Invalid timezone — fall through
  }
  return date.toLocaleDateString('en-US', defaults);
}

/**
 * Get abbreviated timezone name (e.g. "EST", "CET") for display.
 * Returns null if timezone is not provided.
 */
export function getTimezoneAbbr(tz: string | null | undefined): string | null {
  if (!tz) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    return tzPart?.value || null;
  } catch {
    return null;
  }
}

/**
 * Get the UTC offset string (e.g. "UTC+1", "UTC-5") for a timezone.
 */
export function getTimezoneOffset(tz: string | null | undefined): string | null {
  if (!tz) return null;
  try {
    const now = new Date();
    // Get offset by comparing UTC and local representations
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone: tz });
    const utcDate = new Date(utcStr);
    const tzDate = new Date(tzStr);
    const diffMinutes = (tzDate.getTime() - utcDate.getTime()) / (1000 * 60);
    const hours = Math.floor(Math.abs(diffMinutes) / 60);
    const mins = Math.abs(diffMinutes) % 60;
    const sign = diffMinutes >= 0 ? '+' : '-';
    return mins > 0 ? `UTC${sign}${hours}:${String(mins).padStart(2, '0')}` : `UTC${sign}${hours}`;
  } catch {
    return null;
  }
}

/**
 * Validate that a string is a valid IANA timezone identifier.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
