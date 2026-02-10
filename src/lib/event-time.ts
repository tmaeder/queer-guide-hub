import { format, parseISO } from 'date-fns';

/**
 * Determines whether an event should be treated as "All Day" based on its UTC times.
 *
 * Patterns detected:
 *  - Classic: start 00:00 UTC, end 23:59 UTC
 *  - Midnight-to-midnight: both start and end at 00:00 UTC
 *  - Duration ≥ 23 h 50 m (covers minor offsets like 23:59:59)
 *  - End before or equal to start on the same day (wraparound / bad data)
 */
function isAllDayEvent(start: Date, end: Date | null): boolean {
  if (!end) {
    // No end time — treat as all-day if start is midnight UTC
    const sH = start.getUTCHours();
    const sM = start.getUTCMinutes();
    return sH === 0 && sM === 0;
  }

  const sH = start.getUTCHours();
  const sM = start.getUTCMinutes();
  const eH = end.getUTCHours();
  const eM = end.getUTCMinutes();

  // Classic midnight → 23:59
  if (sH === 0 && sM === 0 && eH === 23 && eM === 59) return true;

  // Both midnight (multi-day or identical)
  if (sH === 0 && sM === 0 && eH === 0 && eM === 0) return true;

  // Duration-based: ≥ 23h50m on the same calendar day or spanning days
  const diffMs = end.getTime() - start.getTime();
  if (diffMs >= 23 * 60 * 60 * 1000 + 50 * 60 * 1000) return true;

  // Same calendar day and end <= start (wraparound artefact, e.g. 4:00 PM – 3:59 PM)
  if (
    start.toDateString() === end.toDateString() &&
    end.getTime() <= start.getTime()
  ) {
    return true;
  }

  return false;
}

/**
 * Format an event's time portion for display.
 * Returns "All Day" for all-day events, otherwise "h:mm a - h:mm a".
 */
export function formatEventTime(
  startDate: string,
  endDate?: string | null,
): string {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;

  if (isAllDayEvent(start, end)) return 'All Day';

  if (end) {
    return `${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
  }
  return format(start, 'h:mm a');
}

/**
 * Format an event date + time for combined display (used in GroupEventCard).
 * Multi-day events show date range; single-day events show "date - time".
 */
export function formatEventDateTime(
  startDate: string,
  endDate?: string | null,
): string {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  const allDay = isAllDayEvent(start, end);

  if (end && start.toDateString() !== end.toDateString()) {
    // Multi-day event
    return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`;
  }

  if (allDay) {
    return `${format(start, 'MMM d, yyyy')} \u2022 All Day`;
  }

  if (end) {
    return `${format(start, 'MMM d, yyyy')} \u2022 ${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`;
  }

  return format(start, 'MMM d, yyyy \u2022 h:mm a');
}
