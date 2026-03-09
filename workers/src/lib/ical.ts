/**
 * iCal generation helper.
 * Migrated from supabase/functions/_shared/ical-generator.ts
 */

export interface ICalEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  dtstart: string; // ISO datetime
  dtend?: string;
  url?: string;
  categories?: string[];
}

function formatDate(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace('Z', '') + 'Z';
}

function escapeIcal(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function generateICalFeed(
  calName: string,
  events: ICalEvent[],
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Queer Guide//EN',
    `X-WR-CALNAME:${escapeIcal(calName)}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const evt of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${evt.uid}`);
    lines.push(`DTSTART:${formatDate(evt.dtstart)}`);
    if (evt.dtend) lines.push(`DTEND:${formatDate(evt.dtend)}`);
    lines.push(`SUMMARY:${escapeIcal(evt.summary)}`);
    if (evt.description) lines.push(`DESCRIPTION:${escapeIcal(evt.description)}`);
    if (evt.location) lines.push(`LOCATION:${escapeIcal(evt.location)}`);
    if (evt.url) lines.push(`URL:${evt.url}`);
    if (evt.categories?.length) lines.push(`CATEGORIES:${evt.categories.map(escapeIcal).join(',')}`);
    lines.push(`DTSTAMP:${formatDate(new Date().toISOString())}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
