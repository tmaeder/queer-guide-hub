import { Link } from 'react-router';
import { filteredListHref } from '@/lib/cmsFilterHref';

const fmtNum = (n: unknown): string =>
  typeof n === 'number' && Number.isFinite(n) ? new Intl.NumberFormat().format(n) : '-';

/**
 * A per-row count that links to another type's admin list filtered to this
 * row, e.g. a city's Venues count -> `/admin/content/venues?city_id=<id>`.
 *
 * `filterField` must be the FK the `<embed>(count)` counts through (`city_id`,
 * `queer_village_id`), never a text column such as `city`, which can disagree
 * with the number. Pair it with `listEmbedScopes` on the config so the count
 * is scoped to the linked list's default slice and the two agree.
 *
 * Built without the registry check (`cmsFilteredListPath`) on purpose: see the
 * import-cycle note in cmsFilterHref.ts. A zero count stays text — a link to an
 * empty list is a dead end.
 */
export function countLink(
  row: Record<string, unknown>,
  embed: string,
  registryKey: string,
  filterField: string,
) {
  const rows = row[embed] as Array<{ count?: number }> | null | undefined;
  const count = rows?.[0]?.count ?? 0;
  const name = typeof row.name === 'string' ? row.name : null;
  if (count <= 0 || typeof row.id !== 'string' || !row.id) return fmtNum(count);
  return (
    <Link
      to={filteredListHref(registryKey, filterField, row.id, name)}
      className="font-medium underline underline-offset-2"
      aria-label={`Show ${fmtNum(count)} ${embed} in ${name ?? 'this row'}`}
      onClick={(e) => e.stopPropagation()}
    >
      {fmtNum(count)}
    </Link>
  );
}
