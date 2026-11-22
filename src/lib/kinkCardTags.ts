import type { TagChipItem } from '@/components/tags/TagChipRow';
import type { KinkFilterTerm } from '@/hooks/useKinkFilterTerms';

/**
 * Card tag order: kink & feature filter terms first (with their filter label,
 * e.g. "Sling" for `sex-swing`), then the remaining tags as before. Terms that
 * need the 18+ confirmation are dropped when the visitor has not given it.
 *
 * `terms` undefined (still loading) returns the tags unchanged — the previous
 * behaviour — rather than guessing which are gated.
 */
export function orderCardTags(
  tags: string[] | null | undefined,
  terms: KinkFilterTerm[] | undefined,
  affirmed: boolean,
): TagChipItem[] {
  const list = tags ?? [];
  if (!terms) return list.map((tag) => ({ tag }));
  const bySlug = new Map(terms.map((t) => [t.slug, t]));
  const kink = list
    .map((tag) => bySlug.get(tag))
    .filter((t): t is KinkFilterTerm => !!t && (affirmed || t.public_without_18))
    .sort((a, b) =>
      a.term_group === b.term_group ? a.sort - b.sort : a.term_group === 'feature' ? -1 : 1,
    )
    .map((t) => ({ tag: t.slug, name: t.label }));
  const rest = list.filter((tag) => !bySlug.has(tag)).map((tag) => ({ tag }));
  return [...kink, ...rest];
}
