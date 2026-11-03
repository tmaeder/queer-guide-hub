import { COMPETITION_CATEGORIES, type CategoryDef } from '@/lib/competitionCategories';

/**
 * The "Competed in" filter on /personalities, as ONE string value so it fits
 * the page's flat `?key=value` URL contract.
 *
 *   `any`               anyone with at least one competition entry
 *   `<category id>`     e.g. `drag_series` — a whole type
 *   `<competition slug>` e.g. `rupauls-drag-race-uk` — one competition
 *
 * Category ids are snake_case and competition slugs are kebab-case, but the
 * category check reads the live category list rather than relying on that
 * spelling, so a category added through the reference taxonomy is still
 * recognised as one.
 */
export type CompetedIn =
  { kind: 'any' } | { kind: 'category'; id: string } | { kind: 'competition'; slug: string };

export const COMPETED_ANY = 'any';

const VALUE_RE = /^[a-z0-9_-]{1,80}$/;

export function isValidCompetedIn(value: string): boolean {
  return VALUE_RE.test(value);
}

export function parseCompetedIn(value: string | undefined): CompetedIn | undefined {
  if (!value || !isValidCompetedIn(value)) return undefined;
  if (value === COMPETED_ANY) return { kind: 'any' };
  if (COMPETITION_CATEGORIES.some((c) => c.id === value)) return { kind: 'category', id: value };
  return { kind: 'competition', slug: value };
}

/**
 * The PostgREST embed that makes the filter work. `!inner` on every hop turns
 * the embed into a semi-join: a personality with no matching entry is dropped
 * from the parent result, and the `count: 'exact'` total counts PARENT rows,
 * so a queen with three seasons is still one result.
 *
 * The editions hop names its foreign key because `competition_entrants` points
 * at `competition_editions` twice (`edition_id` and `returning_from_edition_id`)
 * and PostgREST refuses an ambiguous embed with PGRST201.
 */
export const COMPETED_IN_EMBED =
  'competed:competition_entrants!inner(ed:competition_editions!competition_entrants_edition_id_fkey!inner(c:competitions!inner(slug,category)))';

/** The column a parsed filter constrains, or null when the semi-join alone suffices. */
export function competedInColumn(c: CompetedIn): { column: string; value: string } | null {
  if (c.kind === 'category') return { column: 'competed.ed.c.category', value: c.id };
  if (c.kind === 'competition') return { column: 'competed.ed.c.slug', value: c.slug };
  return null;
}

/** One option row for the "Competed in" select. Mirrors `CompetedInOption`
 *  in useCompetitions.ts, restated structurally so this module stays free of
 *  the hooks layer. */
export interface CompetedInOptionLike {
  slug: string;
  name: string;
  category: string;
}

/**
 * Groups options under the competition types, in the types' canonical order,
 * with each type's competitions sorted ALPHABETICALLY by name.
 *
 * The RPC returns them by people count, which is the wrong order for a list a
 * reader scans for a name they already know. Sorting happens here, not in SQL,
 * so it uses the reader's locale (`Intl.Collator`, accent- and case-blind:
 * "Drag Race España" sits with the other "Drag Race" rows) and a later change
 * to the RPC's ORDER BY cannot silently reorder the dropdown.
 *
 * `hideEmpty` drops types with no options. Callers pass false when the counts
 * are unknown, because then an empty group means "not loaded", not "nobody".
 */
export function groupCompetedInOptions<T extends CompetedInOptionLike>(
  options: readonly T[],
  { locale, hideEmpty }: { locale?: string; hideEmpty: boolean },
): { category: CategoryDef; items: T[] }[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const byCategory = new Map<string, T[]>();
  for (const o of options) {
    const list = byCategory.get(o.category) ?? [];
    list.push(o);
    byCategory.set(o.category, list);
  }
  return COMPETITION_CATEGORIES.map((category) => ({
    category,
    items: [...(byCategory.get(category.id) ?? [])].sort((a, b) =>
      collator.compare(a.name, b.name),
    ),
  })).filter((g) => !hideEmpty || g.items.length > 0);
}

/**
 * The competitions to name on one line key row: the `limit` with the most
 * linked people, ties broken by name, plus how many were left out.
 *
 * The opposite order to the dropdown on purpose. The dropdown is a list a
 * reader scans for a name they already know, so it is alphabetical. A line key
 * row has room for three names and answers "what is in here", so it leads with
 * the competitions most of the people are in.
 */
export function topCompetitionsForCategory<T extends CompetedInOptionLike & { people: number }>(
  options: readonly T[],
  categoryId: string,
  limit: number,
  locale?: string,
): { shown: T[]; more: number } {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const inCategory = options
    .filter((o) => o.category === categoryId)
    .sort((a, b) => b.people - a.people || collator.compare(a.name, b.name));
  return { shown: inCategory.slice(0, limit), more: Math.max(0, inCategory.length - limit) };
}
