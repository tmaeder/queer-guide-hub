/**
 * Pure view model for /tags/sti-guide.
 *
 * Everything the page needs to decide BEFORE it renders lives here so it can be
 * tested without a DOM: which practice groups exist and in what order, what one
 * infection's row says, and where the week ticks fall on the testing scale.
 *
 * The reason it exists at all is `groupPractices`. The page used to build its
 * column groups by walking `matrix.practices` and starting a new group whenever
 * the `group` key changed from the previous row — a run-length encoding, which
 * is only a grouping if the input is already sorted. It is not:
 * `sti_transmission_matrix()` returns `mutual-masturbation` (oral_touching)
 * after `cunnilingus` (vaginal) and `scat` (anorectal) last, so the live page
 * rendered SIX column groups with "Oral & touching" and "Anal sex & play" each
 * printed twice over non-adjacent columns (measured on prod 2026-09-04:
 * `th[scope=colgroup]` count 6, spans 4/3/2/2/1/1). A reader scanning for the
 * anal-sex band found two of them, at opposite ends of the chart.
 *
 * The fix is to group by KEY and order by a declared vocabulary rather than by
 * arrival, so a future row appended anywhere in the RPC's output lands in its
 * band instead of minting a duplicate one. An unknown group sorts last rather
 * than being dropped — on a safety chart a practice the bundle has no label for
 * must still appear, under its raw key, not vanish.
 */

export interface Practice {
  slug: string;
  label: string;
  group: string;
}

export interface Sti {
  id: string;
  slug: string;
  name: string;
  pathogen: 'virus' | 'bacteria';
  vaccine_note?: string | null;
}

export interface Cell {
  tag: string;
  practice: string;
  risk: string;
  severity: number;
  blood: boolean;
}

export interface PracticeGroup {
  group: string;
  practices: Practice[];
}

/**
 * Declared band order, worst-exposure-first as the source chart prints it.
 * A group absent from this list keeps its data order and sorts after all of
 * these — see the module note on never dropping an unknown key.
 */
export const PRACTICE_GROUP_ORDER = ['anorectal', 'oral_touching', 'chems', 'vaginal'] as const;

export function groupPractices(practices: readonly Practice[]): PracticeGroup[] {
  const byKey = new Map<string, Practice[]>();
  for (const p of practices) {
    const list = byKey.get(p.group);
    if (list) list.push(p);
    else byKey.set(p.group, [p]);
  }
  const rank = (g: string) => {
    const i = PRACTICE_GROUP_ORDER.indexOf(g as (typeof PRACTICE_GROUP_ORDER)[number]);
    return i === -1 ? PRACTICE_GROUP_ORDER.length : i;
  };
  return [...byKey.entries()]
    .map(([group, list]) => ({ group, practices: list }))
    .sort((a, b) => rank(a.group) - rank(b.group));
}

/** Practices flattened back out in the grouped column order the header uses. */
export function orderedPractices(groups: readonly PracticeGroup[]): Practice[] {
  return groups.flatMap((g) => g.practices);
}

export interface Route {
  practice: Practice;
  risk: string;
  severity: number;
  blood: boolean;
}

/**
 * One infection's documented routes, worst first.
 *
 * ORDER IS THE SAFETY FEATURE, the same rule `StiProfile` states: the highest
 * risk has to be the first thing read. Ties break on the grouped column order
 * so the narrow layout and the grid tell the same story in the same sequence.
 */
export function routesFor(
  sti: Sti,
  practices: readonly Practice[],
  cells: readonly Cell[],
): Route[] {
  const position = new Map(practices.map((p, i) => [p.slug, i]));
  return cells
    .filter((c) => c.tag === sti.id)
    .flatMap((c) => {
      const practice = practices.find((p) => p.slug === c.practice);
      return practice ? [{ practice, risk: c.risk, severity: c.severity, blood: c.blood }] : [];
    })
    .sort(
      (a, b) =>
        a.severity - b.severity ||
        (position.get(a.practice.slug) ?? 0) - (position.get(b.practice.slug) ?? 0),
    );
}

/** Testing-window scale, in weeks. The longest real window is 12 (hep C). */
export const SCALE_WEEKS = 16;

/** Axis ticks for the testing track. A bar length only reads as a quantity
 *  against a scale; without one it is decoration that happens to vary. */
export const WEEK_TICKS = [0, 4, 8, 12, 16] as const;

/**
 * Where a tick or an axis label sits, 0–100% of the track. Ticks may reach the
 * far edge; a BAR may not — see `barStartPercent`.
 */
export function weekOffsetPercent(weeks: number): number {
  return Math.min(Math.max((weeks / SCALE_WEEKS) * 100, 0), 100);
}

/**
 * Where a bar STARTS. Capped below the right edge so the bar always retains
 * width.
 *
 * The bar is `left: x%; right: 0`, so its width is `100 - x`. At the full
 * 16-week scale that is ZERO — a 0px box whose label is `text-background` on
 * `bg-foreground`, i.e. paper on paper: the window silently disappears rather
 * than reading as "the longest one". The pre-redesign code capped at 90 and the
 * rewrite dropped it.
 *
 * The corpus tops out at 12 weeks so nothing hits this today, which is exactly
 * why it needs a guard instead of a comment: the cap is here for the row that
 * has not landed yet.
 */
export const MAX_BAR_START_PERCENT = 90;

export function barStartPercent(weeks: number): number {
  return Math.min(weekOffsetPercent(weeks), MAX_BAR_START_PERCENT);
}
