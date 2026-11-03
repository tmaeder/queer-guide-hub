import { COMPETITION_CATEGORIES } from '@/lib/competitionCategories';

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
