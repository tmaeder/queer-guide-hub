/**
 * Date parsing and timezone utilities
 */

/** Common date format patterns */
const DATE_PATTERNS: Array<{ regex: RegExp; parse: (m: RegExpMatchArray) => Date | null }> = [
  // ISO 8601: 2026-03-15T14:00:00Z or 2026-03-15T14:00:00+02:00
  {
    regex: /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)$/,
    parse: (m) => new Date(m[1]),
  },
  // ISO date: 2026-03-15
  {
    regex: /^(\d{4})-(\d{2})-(\d{2})$/,
    parse: (m) => new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])),
  },
  // US format: March 15, 2026
  {
    regex: /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/,
    parse: (m) => new Date(`${m[1]} ${m[2]}, ${m[3]}`),
  },
  // European format: 15 March 2026
  {
    regex: /^(\d{1,2})\s+(\w+)\s+(\d{4})$/,
    parse: (m) => new Date(`${m[2]} ${m[1]}, ${m[3]}`),
  },
  // European with time: 15 March 2026 7:00 PM
  {
    regex: /^(\d{1,2})\s+(\w+)\s+(\d{4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))$/i,
    parse: (m) => new Date(`${m[2]} ${m[1]}, ${m[3]} ${m[4]}`),
  },
  // US with time: March 15, 2026 7:00 PM
  {
    regex: /^(\w+)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))$/i,
    parse: (m) => new Date(`${m[1]} ${m[2]}, ${m[3]} ${m[4]}`),
  },
  // Slash formats: 15/03/2026 or 03/15/2026
  {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    parse: (m) => {
      const a = parseInt(m[1]);
      const b = parseInt(m[2]);
      const year = parseInt(m[3]);
      // If first number > 12, it's DD/MM/YYYY
      if (a > 12) return new Date(year, b - 1, a);
      // If second number > 12, it's MM/DD/YYYY
      if (b > 12) return new Date(year, a - 1, b);
      // Ambiguous — default to DD/MM/YYYY (European)
      return new Date(year, b - 1, a);
    },
  },
];

/**
 * Pre-process a date string to normalize common patterns:
 * - Strip day names (Monday, Tuesday, etc.)
 * - Strip ordinal suffixes (1st, 2nd, 3rd, 4th, etc.)
 * - Normalize "at HH:MM AM/PM" to "HH:MM AM/PM"
 * - Strip "at various times"
 */
function preprocessDateString(input: string): string {
  let s = input;
  // Remove day names
  s = s.replace(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+/i, '');
  // Remove ordinal suffixes
  s = s.replace(/(\d+)(?:st|nd|rd|th)\b/g, '$1');
  // Normalize "at HH:MM" to just the time
  s = s.replace(/\s+at\s+(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i, ' $1');
  // Remove "at various times" or similar
  s = s.replace(/\s+at\s+various\s+times/i, '');
  return s.trim();
}

/** Try to parse a date string using multiple patterns */
export function parseDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try native Date parse first for ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  // Pre-process to handle ordinals, day names, etc.
  const cleaned = preprocessDateString(trimmed);

  for (const { regex, parse } of DATE_PATTERNS) {
    // Try both original and cleaned
    for (const str of [trimmed, cleaned]) {
      const match = str.match(regex);
      if (match) {
        const d = parse(match);
        if (d && !isNaN(d.getTime())) return d;
      }
    }
  }

  // Last resort: native Date constructor on both original and cleaned
  for (const str of [trimmed, cleaned]) {
    const fallback = new Date(str);
    if (!isNaN(fallback.getTime())) return fallback;
  }

  return null;
}

/** Extract a date range from text like "March 15-17, 2026" or "March 15 - March 17, 2026" */
export function parseDateRange(input: string): { start: Date | null; end: Date | null } {
  const trimmed = input.trim();

  // "March 15-17, 2026"
  const sameMo = trimmed.match(/^(\w+)\s+(\d{1,2})\s*[-–]\s*(\d{1,2}),?\s+(\d{4})$/);
  if (sameMo) {
    const start = new Date(`${sameMo[1]} ${sameMo[2]}, ${sameMo[4]}`);
    const end = new Date(`${sameMo[1]} ${sameMo[3]}, ${sameMo[4]}`);
    return {
      start: isNaN(start.getTime()) ? null : start,
      end: isNaN(end.getTime()) ? null : end,
    };
  }

  // "March 15 - March 17, 2026" or "March 15, 2026 - March 17, 2026"
  const parts = trimmed.split(/\s*[-–]\s*/);
  if (parts.length === 2) {
    return {
      start: parseDate(parts[0]),
      end: parseDate(parts[1]),
    };
  }

  // Single date
  return { start: parseDate(trimmed), end: null };
}

/** Infer timezone from a city/country (basic heuristic) */
export function inferTimezone(city?: string | null, country?: string | null): string {
  const loc = `${city || ''} ${country || ''}`.toLowerCase();

  const tzMap: Record<string, string> = {
    'united states': 'America/New_York',
    'usa': 'America/New_York',
    'united kingdom': 'Europe/London',
    'uk': 'Europe/London',
    'london': 'Europe/London',
    'france': 'Europe/Paris',
    'paris': 'Europe/Paris',
    'germany': 'Europe/Berlin',
    'berlin': 'Europe/Berlin',
    'spain': 'Europe/Madrid',
    'madrid': 'Europe/Madrid',
    'barcelona': 'Europe/Madrid',
    'italy': 'Europe/Rome',
    'rome': 'Europe/Rome',
    'netherlands': 'Europe/Amsterdam',
    'amsterdam': 'Europe/Amsterdam',
    'australia': 'Australia/Sydney',
    'sydney': 'Australia/Sydney',
    'canada': 'America/Toronto',
    'toronto': 'America/Toronto',
    'japan': 'Asia/Tokyo',
    'tokyo': 'Asia/Tokyo',
    'brazil': 'America/Sao_Paulo',
    'thailand': 'Asia/Bangkok',
    'bangkok': 'Asia/Bangkok',
    'new york': 'America/New_York',
    'los angeles': 'America/Los_Angeles',
    'san francisco': 'America/Los_Angeles',
    'chicago': 'America/Chicago',
  };

  for (const [key, tz] of Object.entries(tzMap)) {
    if (loc.includes(key)) return tz;
  }

  return 'UTC';
}
