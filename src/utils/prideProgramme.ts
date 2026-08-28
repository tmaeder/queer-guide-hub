/**
 * Pure grouping for a Pride programme.
 *
 * A Pride is three things at once — a parade, a festival over one or more days,
 * and a Pride Week of satellites around both. In the database that is one
 * umbrella event plus children linked by `events.parent_event_id`, each child
 * carrying `pride_subtypes` (bare slugs, see migration 20261002100000).
 *
 * A child with NO subtype falls into `week`. That is deliberate: the lane is
 * the honest answer for "something happening during Pride that nobody has
 * classified yet", and it means the section still renders while curation is
 * only half done. Dropping unclassified children instead would make the page
 * quietly incomplete.
 *
 * A child may legitimately carry several subtypes (a film gala that is also the
 * festival's opening night); it then appears in every lane it claims, because
 * a reader scanning "Festival" should not miss it for being also a film.
 */

export type ProgrammeLane = 'parade' | 'festival' | 'week';

export interface ProgrammeChild {
  id: string;
  slug: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  pride_subtypes?: string[] | null;
  event_type?: string | null;
  venue_name?: string | null;
  address?: string | null;
  ticket_url?: string | null;
  is_free?: boolean | null;
  status?: string | null;
}

export interface ProgrammeLanes {
  parade: ProgrammeChild[];
  festival: ProgrammeChild[];
  week: ProgrammeChild[];
}

/** Subtypes that put a child in the parade lane. */
const PARADE = new Set(['parade', 'rally']);
/** Subtypes that put a child in the festival lane. */
const FESTIVAL = new Set(['festival']);

function byStart(a: ProgrammeChild, b: ProgrammeChild): number {
  const d = new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
  if (d !== 0) return d;
  return a.title.localeCompare(b.title);
}

export function groupProgramme(children: readonly ProgrammeChild[]): ProgrammeLanes {
  const lanes: ProgrammeLanes = { parade: [], festival: [], week: [] };

  for (const child of children) {
    const subtypes = (child.pride_subtypes ?? []).filter(Boolean);
    const inParade = subtypes.some((s) => PARADE.has(s));
    const inFestival = subtypes.some((s) => FESTIVAL.has(s));

    if (inParade) lanes.parade.push(child);
    if (inFestival) lanes.festival.push(child);
    // Everything else — including a child with no subtype at all — is week
    // programme. `week` is also an explicit subtype, so it lands here twice
    // over, which is why the condition is "claimed neither of the other two".
    if (!inParade && !inFestival) lanes.week.push(child);
  }

  lanes.parade.sort(byStart);
  lanes.festival.sort(byStart);
  lanes.week.sort(byStart);
  return lanes;
}

export function hasProgramme(lanes: ProgrammeLanes): boolean {
  return lanes.parade.length + lanes.festival.length + lanes.week.length > 0;
}

/**
 * Day span of a set of children, as [earliest start, latest end]. Used for the
 * lane summary line ("Festival 3–5 Jul"). Returns null for an empty lane.
 */
export function laneSpan(children: readonly ProgrammeChild[]): [Date, Date] | null {
  if (children.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const c of children) {
    const s = new Date(c.start_date).getTime();
    const e = new Date(c.end_date ?? c.start_date).getTime();
    if (Number.isFinite(s)) min = Math.min(min, s);
    // An end date that predates its own start is corrupt data, not a signal —
    // fall back to the start so the span never renders backwards.
    if (Number.isFinite(e)) max = Math.max(max, Math.max(e, Number.isFinite(s) ? s : e));
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return [new Date(min), new Date(max)];
}

/** Group children by calendar day, for the week lane's day headings. */
export function byDay(children: readonly ProgrammeChild[]): Array<[string, ProgrammeChild[]]> {
  const out = new Map<string, ProgrammeChild[]>();
  for (const c of children) {
    const d = new Date(c.start_date);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bucket = out.get(key);
    if (bucket) bucket.push(c);
    else out.set(key, [c]);
  }
  return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
