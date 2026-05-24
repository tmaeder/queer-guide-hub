// Tiny cron parser — handles the simple patterns our admin_automations
// use today. Not a general cron implementation; intentionally narrow.
//
// Supported field syntax:
//   "*"      (any value)
//   N        (single integer)
//   "*\/N"  (every N, e.g. star-slash-15 for every 15 units)
//
// Returns the next UTC Date at/after `from` (default: now), or null when
// the schedule string can't be parsed.

interface CronFields {
  minute: (m: number) => boolean;
  hour: (h: number) => boolean;
  dayOfMonth: (d: number) => boolean;
  month: (m: number) => boolean;
  dayOfWeek: (d: number) => boolean;
}

function parseField(token: string): ((v: number) => boolean) | null {
  if (token === '*') return () => true;
  const stepMatch = token.match(/^\*\/(\d+)$/);
  if (stepMatch) {
    const step = parseInt(stepMatch[1], 10);
    if (step <= 0) return null;
    return (v) => v % step === 0;
  }
  const n = parseInt(token, 10);
  if (Number.isFinite(n) && String(n) === token.trim()) {
    return (v) => v === n;
  }
  return null;
}

function parseCron(expr: string): CronFields | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [m, h, dom, mo, dow] = parts.map(parseField);
  if (!m || !h || !dom || !mo || !dow) return null;
  return { minute: m, hour: h, dayOfMonth: dom, month: mo, dayOfWeek: dow };
}

/** Next UTC Date that matches the cron expression, or null. */
export function nextCronFire(expr: string | null | undefined, from = new Date()): Date | null {
  if (!expr) return null;
  const fields = parseCron(expr);
  if (!fields) return null;

  const candidate = new Date(from);
  candidate.setUTCSeconds(0, 0);
  candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);

  // Safety bound: scan at most ~2 years of minutes (cron domain is finite).
  const maxIterations = 60 * 24 * 366 * 2;
  for (let i = 0; i < maxIterations; i++) {
    if (
      fields.minute(candidate.getUTCMinutes()) &&
      fields.hour(candidate.getUTCHours()) &&
      fields.dayOfMonth(candidate.getUTCDate()) &&
      fields.month(candidate.getUTCMonth() + 1) &&
      fields.dayOfWeek(candidate.getUTCDay())
    ) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }
  return null;
}

/** Compact relative label for the next fire. "in 3h 20m" or "tomorrow at 03:30 UTC". */
export function formatNextFire(expr: string | null | undefined, from = new Date()): string {
  const next = nextCronFire(expr, from);
  if (!next) return '—';
  const ms = next.getTime() - from.getTime();
  if (ms <= 0) return 'now';

  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) return `in ${totalMinutes}m`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return `in ${hours}h ${minutes}m`;

  // > 24h away: show absolute UTC time.
  const day = next.getUTCDate();
  const month = next.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const hh = String(next.getUTCHours()).padStart(2, '0');
  const mm = String(next.getUTCMinutes()).padStart(2, '0');
  return `${month} ${day} · ${hh}:${mm} UTC`;
}
