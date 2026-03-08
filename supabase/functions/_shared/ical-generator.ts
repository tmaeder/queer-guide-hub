/**
 * Shared iCal generation utilities for Supabase Edge Functions.
 *
 * Used by both calendar-feed (subscription feed) and calendar-export
 * (single-event download) to avoid duplicating iCal formatting logic.
 */

/**
 * Convert an ISO-8601 date string (or Date-compatible string) to iCal
 * date-time format: YYYYMMDDTHHMMSSZ
 *
 * Example: "2025-06-15T18:30:00.000Z" -> "20250615T183000Z"
 */
export const formatICalDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
};

/**
 * Escape special characters in text values per RFC 5545 Section 3.3.11.
 *
 * Backslashes, commas, and semicolons are escaped with a leading backslash.
 * Newlines are converted to the literal sequence \n, and bare carriage
 * returns are stripped.
 */
export const escapeICalText = (text: string): string => {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
};

/** Fields accepted by generateVEvent. */
export interface VEventParams {
  uid: string;
  summary: string;
  dtstart: string;           // already in iCal format (YYYYMMDDTHHMMSSZ)
  dtend?: string;             // already in iCal format
  description?: string;       // raw text — will be escaped
  location?: string;          // raw text — will be escaped
  url?: string;
  organizer?: string;         // raw text for ORGANIZER;CN=...
  /** Extra iCal property lines to include (e.g. "STATUS:CONFIRMED"). */
  extraLines?: string[];
}

/**
 * Generate a VEVENT block from the supplied parameters.
 *
 * All text values (summary, description, location) are escaped.
 * Optional fields are omitted when not provided.
 */
export const generateVEvent = (params: VEventParams): string => {
  const now = formatICalDateTime(new Date().toISOString());

  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${params.uid}`,
    `DTSTART:${params.dtstart}`,
  ];

  if (params.dtend) {
    lines.push(`DTEND:${params.dtend}`);
  }

  lines.push(`DTSTAMP:${now}`);
  lines.push(`SUMMARY:${escapeICalText(params.summary)}`);

  if (params.description) {
    lines.push(`DESCRIPTION:${escapeICalText(params.description)}`);
  }

  if (params.location) {
    lines.push(`LOCATION:${escapeICalText(params.location)}`);
  }

  if (params.organizer) {
    lines.push(`ORGANIZER;CN=${escapeICalText(params.organizer)}:mailto:`);
  }

  if (params.url) {
    lines.push(`URL:${params.url}`);
  }

  if (params.extraLines) {
    lines.push(...params.extraLines);
  }

  lines.push('END:VEVENT');

  return lines.join('\r\n');
};

/** Options for the VCALENDAR wrapper. */
export interface ICalendarOptions {
  prodId: string;
  calendarName?: string;
  calendarDescription?: string;
  timezone?: string;
}

/**
 * Wrap one or more VEVENT blocks inside a full VCALENDAR document.
 *
 * Returns a complete .ics file body ready to be served with
 * Content-Type: text/calendar.
 */
export const wrapICalendar = (
  vevents: string[],
  options: ICalendarOptions,
): string => {
  const header: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${options.prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  if (options.calendarName) {
    header.push(`X-WR-CALNAME:${options.calendarName}`);
  }
  if (options.calendarDescription) {
    header.push(`X-WR-CALDESC:${options.calendarDescription}`);
  }
  if (options.timezone) {
    header.push(`X-WR-TIMEZONE:${options.timezone}`);
  }

  const footer = 'END:VCALENDAR';

  return [header.join('\r\n'), ...vevents, footer].join('\r\n');
};
