import { useSearchParams } from 'react-router';
import { useMarketplaceCollections } from '@/hooks/useMarketplaceCollections';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { OCCASION_CHIPS } from '@/lib/marketplaceTaxonomy';

/**
 * Horizontal-scrolling chip row at the top of /marketplace. Two chip kinds:
 *  - occasion-attribute chips (Pride / Drag / Wedding / Everyday) — one-tap
 *    toggles driven by the `?occ=` URL param, filtering via the occ-* tags
 *    the tag engine mines onto products;
 *  - editor-curated collection chips (marketplace_collections, display 'chip'),
 *    navigating to the collection drilldown.
 */
export function OccasionChips({
  className,
  kinds = ['occasion', 'collection'],
}: {
  className?: string;
  /** Which chip kinds to render — the control bar owns occasion toggles now. */
  kinds?: Array<'occasion' | 'collection'>;
}) {
  const { collections } = useMarketplaceCollections('chip');
  const [searchParams, setSearchParams] = useSearchParams();
  const activeOcc = searchParams.get('occ') ?? '';
  const showOccasions = kinds.includes('occasion');
  const showCollections = kinds.includes('collection');
  if (!showOccasions && (!showCollections || collections.length === 0)) return null;

  const toggleOcc = (slug: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (activeOcc === slug) next.delete('occ');
        else next.set('occ', slug);
        next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  return (
    <nav
      aria-label="Marketplace collections"
      className={`-mx-4 overflow-x-auto ${className ?? 'mb-12'}`}
    >
      <ul className="flex gap-2 px-4 pb-2 min-w-max">
        {showOccasions && OCCASION_CHIPS.map((c) => {
          const active = activeOcc === c.slug;
          return (
            <li key={c.slug} className="shrink-0">
              <button
                type="button"
                onClick={() => toggleOcc(c.slug)}
                aria-pressed={active}
                className={`inline-flex items-center gap-2 rounded-element border px-4 py-2 text-sm transition-colors ${
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:border-foreground/40'
                }`}
              >
                <span className="font-medium">{c.label}</span>
              </button>
            </li>
          );
        })}
        {showCollections && collections.map((c) => (
          <li key={c.id} className="shrink-0">
            <LocalizedLink
              to={`/marketplace/collection/${c.slug}`}
              className="inline-flex items-center gap-2 rounded-element border border-border px-4 py-2 text-sm hover:border-foreground/40 transition-colors"
            >
              <span className="font-medium">{c.title}</span>
              {c.subtitle && (
                <span className="hidden md:inline text-muted-foreground text-xs">
                  · {c.subtitle}
                </span>
              )}
            </LocalizedLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
