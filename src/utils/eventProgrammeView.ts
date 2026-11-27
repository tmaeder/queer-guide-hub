import type { ProgrammeChild } from '@/utils/prideProgramme';
import { isProgrammeRole } from '@/lib/programmeRoles';

/**
 * How a festival programme is organised for a reader.
 *
 * REPLACES THE THREE PRIDE LANES on the event page. Those lanes (parade / festival /
 * "Pride Week") were keyed on `pride_subtypes`, which is NULL on every child in the
 * corpus — so every child fell to the `week` lane and a Madrid New Year's Eve party
 * was published under a heading reading "Pride Week". Measured 8 of 8, twice, months
 * apart. Renaming the lane would not have fixed it: the lane vocabulary is Pride's,
 * and the page renders for any umbrella.
 *
 * A programme has two honest axes — WHEN and WHAT — and day is the primary one,
 * because a festival's children are a timetable before they are a taxonomy.
 *
 * `pride_subtypes` is not deleted. It still drives the Pride-specific lane summary on
 * /pride (ProgrammeSummary), where "Pride Week" is the correct words for the thing,
 * and it still pins a parade here.
 */

/** A parade is the one child whose weekday a reader has to plan around. */
export function isParade(child: ProgrammeChild): boolean {
  if (child.programme_role === 'parade' || child.programme_role === 'rally') return true;
  const subtypes = child.pride_subtypes ?? [];
  return subtypes.includes('parade') || subtypes.includes('rally');
}

/**
 * The bucket a child is grouped under in the by-type view: its programme role when an
 * admin set one (`events.programme_role`), else its `event_type`. The two vocabularies
 * share slugs (party, sports, other), so a role-tagged "party" and an untagged one land
 * in the same group instead of two groups with one name.
 */
export function programmeGroupKey(child: ProgrammeChild): string {
  if (isProgrammeRole(child.programme_role)) return child.programme_role;
  return child.event_type?.trim() || 'other';
}

/** Group by `programmeGroupKey`, largest group first, ties broken alphabetically. */
export function byType(children: readonly ProgrammeChild[]): Array<[string, ProgrammeChild[]]> {
  const out = new Map<string, ProgrammeChild[]>();
  for (const c of children) {
    // An unclassified child is its own honest bucket rather than being hidden or
    // folded into whichever type happens to be first.
    const key = programmeGroupKey(c);
    const bucket = out.get(key);
    if (bucket) bucket.push(c);
    else out.set(key, [c]);
  }
  for (const list of out.values()) {
    list.sort(
      (a, b) =>
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime() ||
        a.title.localeCompare(b.title),
    );
  }
  return [...out.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

/**
 * Should the reader be offered a by-type view at all?
 *
 * BOTH conditions matter, and the second is the one that keeps this honest. A toggle
 * that reveals a single group is a control that does nothing, and measured on the
 * corpus TODAY every umbrella's children share one `event_type` (lila: 3x party,
 * WE Party: 2x other) and the largest programme is 3 children — so this returns false
 * everywhere right now, by design rather than by accident. It starts earning its
 * place when the Programme panel is used and festivals gain real, mixed programmes.
 */
export function shouldOfferTypeToggle(children: readonly ProgrammeChild[]): boolean {
  if (children.length < 6) return false;
  const types = new Set(children.map(programmeGroupKey));
  return types.size > 1;
}

/**
 * Where a child falls inside its umbrella, as calendar days: "day 3 of 5".
 *
 * Calendar days, not 24h blocks, because a party starting at 23:00 on day 2 is on day 2
 * to a reader. Returns null when the umbrella is a single day or the child falls outside
 * it — a "day 7 of 5" would be wrong data dressed as a fact.
 */
export function programmeDayOf(
  childStart: string,
  umbrellaStart: string,
  umbrellaEnd: string | null | undefined,
): { day: number; of: number } | null {
  const dayNumber = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? NaN
      : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  };
  const start = dayNumber(umbrellaStart);
  const end = dayNumber(umbrellaEnd ?? umbrellaStart);
  const child = dayNumber(childStart);
  if (![start, end, child].every(Number.isFinite)) return null;
  const of = end - start + 1;
  const day = child - start + 1;
  if (of < 2 || day < 1 || day > of) return null;
  return { day, of };
}
