import type { PrideCalendarEvent } from '@/hooks/usePrideCalendar';

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

export function buildPrideIcs(events: PrideCalendarEvent[], year: number): string {
  const now = new Date();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Queer Guide//Pride Calendar//EN',
    `X-WR-CALNAME:Pride Calendar ${year}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const e of events) {
    const start = toIcsDate(e.start_date);
    const end = toIcsDate(e.end_date ?? e.start_date);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@queer.guide`,
      `DTSTAMP:${toIcsDate(now.toISOString())}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escape(e.title)}`,
      `LOCATION:${escape([e.city, e.country].filter(Boolean).join(', '))}`,
      `URL:https://queer.guide/events/${e.slug}`,
      e.description ? `DESCRIPTION:${escape(e.description)}` : '',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

export function exportPrideIcs(events: PrideCalendarEvent[], year: number): void {
  const ics = buildPrideIcs(events, year);
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
