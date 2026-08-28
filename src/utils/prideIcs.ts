import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';
import type { ProgrammeChild } from '@/utils/prideProgramme';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function toIcsDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/**
 * Programme children per umbrella id. A Pride that has been curated into a
 * parade + festival + week exports as one VEVENT per part, because a single
 * week-long block in a calendar app tells the reader nothing about when to be
 * at the parade. An uncurated Pride exports exactly as before.
 */
export type ProgrammeIndex = ReadonlyMap<string, readonly ProgrammeChild[]>;

export function buildPrideIcs(
  events: PrideCalendarEvent[],
  year: number,
  programmes?: ProgrammeIndex,
): string {
  const now = new Date();
  const stamp = toIcsDate(now.toISOString());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Queer Guide//Pride Calendar//EN',
    `X-WR-CALNAME:Pride Calendar ${year}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const e of events) {
    const location = escape([e.city, e.country].filter(Boolean).join(', '));
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@queer.guide`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsDate(e.start_date)}`,
      `DTEND:${toIcsDate(e.end_date ?? e.start_date)}`,
      `SUMMARY:${escape(e.title)}`,
      `LOCATION:${location}`,
      `URL:https://queer.guide/events/${e.slug}`,
      e.description ? `DESCRIPTION:${escape(e.description)}` : '',
      'END:VEVENT',
    );

    for (const child of programmes?.get(e.id) ?? []) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${child.id}@queer.guide`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${toIcsDate(child.start_date)}`,
        `DTEND:${toIcsDate(child.end_date ?? child.start_date)}`,
        `SUMMARY:${escape(child.title)}`,
        // The child's own venue when it has one — the parade and the festival
        // are usually in different places, which is half the reason to export
        // them separately at all.
        `LOCATION:${escape(child.venue_name || child.address || '') || location}`,
        `URL:https://queer.guide/events/${child.slug}`,
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

export function exportPrideIcs(
  events: PrideCalendarEvent[],
  year: number,
  programmes?: ProgrammeIndex,
): void {
  const ics = buildPrideIcs(events, year, programmes);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pride-calendar-${year}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
