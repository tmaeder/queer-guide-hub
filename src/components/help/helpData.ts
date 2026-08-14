/**
 * Shared helpers for /help.
 *
 * Everything here used to live twice — `is247` and `channelHref` were byte
 * duplicates across HelpHotlines.tsx and HeroCTA.tsx, and the hero was chosen
 * by two DIFFERENT algorithms over two different input lists: the page's
 * `heroHotline` (which fed the EmergencyService JSON-LD) read the *filtered*
 * list including directories, so typing in the search box rewrote the page's
 * emergency structured data, and /help/int published a website as an
 * EmergencyService. `selectPrimaryLine` is now the only ranking, and both
 * callers pass it the same unfiltered, directory-excluded list.
 */

import type { Hotline, HotlineChannel } from '@/types/cms';

export const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Deutschland',
  AT: 'Österreich',
  CH: 'Schweiz',
  GB: 'United Kingdom',
  IE: 'Ireland',
  US: 'United States',
  CA: 'Canada',
  AU: 'Australia',
  NL: 'Nederland',
  FR: 'France',
  ES: 'España',
  IT: 'Italia',
  INT: 'International',
};

export function countryLabel(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

/** Map hotline topic slugs to resource category URL params. */
export const TOPIC_TO_RESOURCE: Record<string, string> = {
  crisis: 'Mental Health',
  suicide: 'Mental Health',
  lgbtq: 'Identity & Expression',
  trans: 'Gender Identity',
  youth: 'Support Services & NGOs',
  health: 'Health & Wellness',
  hiv: 'Sexual Health',
  violence: 'Safety & Practices',
  discrimination: 'Rights & Activism',
  legal: 'Legal Rights',
  relationships: 'Relationships & Connection',
  'coming-out': 'Questioning & Labels',
  women: 'Identity & Expression',
};

export function matchProfileLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const lower = location.toLowerCase();
  for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
    if (lower.includes(name.toLowerCase()) || lower.includes(code.toLowerCase())) return code;
  }
  return null;
}

export function channelHref(c: HotlineChannel): string {
  switch (c.kind) {
    case 'phone':
    case 'sms':
      return `${c.kind === 'phone' ? 'tel' : 'sms'}:${c.value.replace(/\s+/g, '')}`;
    case 'email':
      return `mailto:${c.value}`;
    case 'whatsapp':
      return c.value.startsWith('http')
        ? c.value
        : `https://wa.me/${c.value.replace(/[^\d]/g, '')}`;
    case 'chat':
      return c.value;
  }
}

/**
 * Every dialable/reachable route on a line, with the legacy scalar `phone`
 * folded in. `channels` is authoritative when present; `phone` is the
 * backward-compatible fallback for entries predating it.
 */
export function hotlineChannels(h: Hotline): HotlineChannel[] {
  if (h.channels && h.channels.length > 0) {
    const hasPhone = h.channels.some((c) => c.kind === 'phone');
    if (hasPhone || !h.phone) return h.channels;
    return [{ kind: 'phone', value: h.phone }, ...h.channels];
  }
  return h.phone ? [{ kind: 'phone', value: h.phone }] : [];
}

/** Non-voice routes, at equal weight to the phone. */
export function nonVoiceChannels(h: Hotline): HotlineChannel[] {
  return hotlineChannels(h).filter((c) => c.kind !== 'phone');
}

export function isDirectory(h: Hotline): boolean {
  return (h.kind ?? 'hotline') === 'directory';
}

// ── Open now ───────────────────────────────────────────────────────

/**
 * Legacy free-text probe, kept only as the fallback for entries with no
 * `always_open` flag yet. Substring matching on prose is exactly why
 * `hours_slots` exists — do not add cases to it, populate the data instead.
 */
export function is247(hours: string): boolean {
  const h = hours.toLowerCase();
  return h.includes('24/7') || h.includes('24 h') || h.includes('rund um die uhr');
}

export function isAlwaysOpen(h: Hotline): boolean {
  return h.always_open ?? is247(h.hours);
}

/** "HH:MM" → minutes from midnight. "24:00" → 1440. Null when unparseable. */
function toMinutes(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const mins = Number(m[2]);
  if (hours > 24 || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * Wall-clock day-of-week and minutes-from-midnight in an arbitrary IANA zone,
 * without pulling in a date library. `Intl` is the only thing in the platform
 * that knows the zone's current UTC offset including DST.
 */
function wallClockIn(tz: string, now: Date): { day: number; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const weekday = get('weekday');
    const hour = get('hour');
    const minute = get('minute');
    if (!weekday || hour === undefined || minute === undefined) return null;
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
    if (day < 0) return null;
    // Intl can render midnight as "24" under hour12:false in some engines.
    return { day, minutes: (Number(hour) % 24) * 60 + Number(minute) };
  } catch {
    // Unknown/invalid IANA zone — unknown, never "closed".
    return null;
  }
}

/**
 * Is this line reachable by phone right now?
 *
 * Returns `null` for unknown, and unknown MUST render as silence. Telling
 * someone a crisis line is closed when it is open is the harmful direction, so
 * every uncertainty here — no slots, no timezone, an unparseable time, an
 * unrecognised zone — resolves to null rather than false.
 *
 * Evaluated in the LINE's timezone, not the viewer's: someone in Berlin
 * looking at an Australian line needs Australia's clock, not their own.
 */
export function isOpenNow(h: Hotline, now: Date = new Date()): boolean | null {
  if (isAlwaysOpen(h)) return true;
  const slots = h.hours_slots;
  if (!slots || slots.length === 0 || !h.timezone) return null;

  const wall = wallClockIn(h.timezone, now);
  if (!wall) return null;

  const yesterday = (wall.day + 6) % 7;

  for (const slot of slots) {
    const open = toMinutes(slot.open);
    const close = toMinutes(slot.close);
    if (open == null || close == null) continue;

    if (close > open) {
      if (slot.day === wall.day && wall.minutes >= open && wall.minutes < close) return true;
    } else {
      // Runs past midnight: the tail belongs to the following day.
      if (slot.day === wall.day && wall.minutes >= open) return true;
      if (slot.day === yesterday && wall.minutes < close) return true;
    }
  }
  return false;
}

// ── Ranking ────────────────────────────────────────────────────────

function score(h: Hotline, now: Date): number {
  let s = 0;
  if (isOpenNow(h, now) === true) s += 20;
  if (isAlwaysOpen(h)) s += 10;
  if (h.free) s += 4;
  if (h.anonymous) s += 2;
  // A line that may contact police without consent is a worse default
  // recommendation, even when it is otherwise the strongest match.
  if (h.reports_to_police) s -= 5;
  if (nonVoiceChannels(h).length > 0) s += 3;
  s += Math.min(h.topics.length, 5);
  return s;
}

/**
 * The country's best line right now — the ONE ranking on this page.
 *
 * Callers must pass the unfiltered list: ranking over search/topic-filtered
 * results is what let a keystroke rewrite the emergency JSON-LD. Directories
 * are excluded here rather than at each call site, so a website can never be
 * published as an EmergencyService or shown behind a "Call now" button.
 */
export function selectPrimaryLine(
  hotlines: Hotline[],
  country: string,
  now: Date = new Date(),
): Hotline | null {
  if (country === 'ALL' || hotlines.length === 0) return null;
  const candidates = hotlines.filter((h) => h.country === country && !isDirectory(h));
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => score(b, now) - score(a, now))[0];
}

/**
 * The best line that is demonstrably reachable RIGHT NOW.
 *
 * `selectPrimaryLine` scores open-now heavily but still returns the strongest
 * line even when it is shut, so at 03:00 the panel offers a full-width "Call
 * now" against a number that rings out. This is the mirror of the
 * unknown-hours rule: we refuse to call a line closed when we are unsure, and
 * we equally refuse to leave a known-closed line as the only thing on offer.
 *
 * Deliberately separate from `selectPrimaryLine` rather than folded into it —
 * that one feeds the EmergencyService JSON-LD, and an alternative that changed
 * with the clock would make the structured data unstable.
 *
 * Requires `isOpenNow === true`, strictly. `null` means we could not structure
 * the hours, and promoting an unknown to "open right now" is the same false
 * promise from the other direction. Same country before INT, because a
 * national line usually answers in the local language.
 */
export function selectOpenAlternative(
  hotlines: Hotline[],
  country: string,
  exclude: Hotline | null,
  now: Date = new Date(),
): Hotline | null {
  if (country === 'ALL' || hotlines.length === 0) return null;

  const open = hotlines.filter(
    (h) =>
      h.id !== exclude?.id &&
      !isDirectory(h) &&
      (h.country === country || h.country === 'INT') &&
      isOpenNow(h, now) === true,
  );
  if (open.length === 0) return null;

  return open.sort((a, b) => {
    const localFirst = (h: Hotline) => (h.country === country ? 0 : 1);
    const d = localFirst(a) - localFirst(b);
    if (d !== 0) return d;
    return score(b, now) - score(a, now);
  })[0];
}

/**
 * Directory sort: reachable now first, then always-open, then the rest.
 * This is the triage the topic filter was pretending to be.
 */
export function sortByAvailability(hotlines: Hotline[], now: Date = new Date()): Hotline[] {
  return [...hotlines].sort((a, b) => {
    const rank = (h: Hotline) => {
      if (isOpenNow(h, now) === true) return 0;
      if (isOpenNow(h, now) === null) return 1; // unknown outranks known-closed
      return 2;
    };
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return score(b, now) - score(a, now);
  });
}
