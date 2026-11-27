/**
 * venues.hours → schema.org OpeningHoursSpecification.
 *
 * Measured 2026-11-22, `hours` holds four shapes and three are machine-readable:
 *   - `weekly`  [{day:'FR', start:'18:00', end:'01:00'}]            (~930 rows)
 *   - `regular` [{day:1..7, open:'0000', close:'+0000'}] Foursquare (~630 rows,
 *               day 1 = Monday, a leading '+' marks a next-day close)
 *   - day keys  {mon:'10:00 AM – 2:00 AM', tue:'Closed', …}          (~930 rows;
 *               131 more are the same object stored as a JSON string)
 *   - `display` free text ("(Usually) Friday 23:30 – 05:00")         (~6,000 rows)
 * `display` is never parsed: it is prose, rendered as text by the body only.
 * Anything not understood is dropped rather than guessed — a wrong hour in
 * structured data is a published claim.
 */

export interface OpeningHoursSpec {
  '@type': 'OpeningHoursSpecification';
  dayOfWeek: string[];
  opens: string;
  closes: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const KEY_DAY: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
  mo: 'Monday',
  tu: 'Tuesday',
  we: 'Wednesday',
  th: 'Thursday',
  fr: 'Friday',
  sa: 'Saturday',
  su: 'Sunday',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** "5pm" "10:30 AM" "17:00" "1700" "+0000" "24:00" → "HH:MM", or null. */
export function parseClock(raw: string): string | null {
  const s = raw.trim().replace(/^\+/, '').toLowerCase();
  const m = /^(\d{1,2})(?::?(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const mer = m[3]?.[0];
  if (min > 59) return null;
  if (mer) {
    if (h < 1 || h > 12) return null;
    if (mer === 'a' && h === 12) h = 0;
    if (mer === 'p' && h !== 12) h += 12;
  } else if (!m[2] && s.length <= 2) {
    return null; // a bare "5" says nothing about am/pm
  }
  if (h === 24 && min === 0) h = 0;
  if (h > 23) return null;
  return `${pad(h)}:${pad(min)}`;
}

function parseRanges(value: string): Array<[string, string]> | null {
  const v = value.trim();
  if (!v || /^closed$/i.test(v)) return [];
  if (/^open 24 hours$/i.test(v) || /^24\s*hours$/i.test(v)) return [['00:00', '23:59']];
  const out: Array<[string, string]> = [];
  for (const part of v.split(/\s*[,;]\s*/)) {
    const m = /^(.+?)\s*(?:–|—|-|\bto\b)\s*(.+)$/i.exec(part);
    if (!m) return null;
    const opens = parseClock(m[1]);
    const closes = parseClock(m[2]);
    if (!opens || !closes) return null;
    out.push([opens, closes]);
  }
  return out;
}

function decode(raw: unknown): Record<string, unknown> | null {
  let v = raw;
  if (typeof v === 'string' && v.trim().startsWith('{')) {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Day → list of [opens, closes], from whichever structured shape the row has. */
function dayRanges(h: Record<string, unknown>): Map<string, Array<[string, string]>> {
  const days = new Map<string, Array<[string, string]>>();
  const add = (day: string | undefined, opens: string | null, closes: string | null) => {
    if (!day || !opens || !closes) return;
    days.set(day, [...(days.get(day) ?? []), [opens, closes]]);
  };

  if (Array.isArray(h.weekly)) {
    for (const e of h.weekly as Array<Record<string, unknown>>) {
      add(
        KEY_DAY[String(e?.day ?? '').toLowerCase()],
        parseClock(String(e?.start ?? '')),
        parseClock(String(e?.end ?? '')),
      );
    }
    if (days.size) return days;
  }
  if (Array.isArray(h.regular)) {
    for (const e of h.regular as Array<Record<string, unknown>>) {
      const d = Number(e?.day);
      add(
        Number.isInteger(d) ? DAYS[d - 1] : undefined,
        parseClock(String(e?.open ?? '')),
        parseClock(String(e?.close ?? '')),
      );
    }
    if (days.size) return days;
  }
  for (const [key, value] of Object.entries(h)) {
    const day = KEY_DAY[key.toLowerCase()];
    if (!day || typeof value !== 'string') continue;
    const ranges = parseRanges(value);
    if (ranges?.length) days.set(day, ranges);
  }
  return days;
}

export function openingHoursSpecification(raw: unknown): OpeningHoursSpec[] | undefined {
  const h = decode(raw);
  if (!h) return undefined;
  const days = dayRanges(h);
  // Group identical intervals so seven equal days are one entry, in week order.
  const grouped = new Map<string, OpeningHoursSpec>();
  for (const day of DAYS) {
    for (const [opens, closes] of days.get(day) ?? []) {
      const key = `${opens}|${closes}`;
      const spec = grouped.get(key);
      if (spec) spec.dayOfWeek.push(day);
      else
        grouped.set(key, { '@type': 'OpeningHoursSpecification', dayOfWeek: [day], opens, closes });
    }
  }
  return grouped.size ? [...grouped.values()] : undefined;
}

/** Plain-text rendering of the same structure for the crawler body. */
export function openingHoursText(specs: OpeningHoursSpec[] | undefined): string | null {
  if (!specs?.length) return null;
  return `${specs
    .map((s) => `${s.dayOfWeek.map((d) => d.slice(0, 3)).join(', ')} ${s.opens}–${s.closes}`)
    .join('; ')}.`;
}
