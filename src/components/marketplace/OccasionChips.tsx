import { useMarketplaceCollections } from '@/hooks/useMarketplaceCollections';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

/**
 * Horizontal-scrolling row of editor-curated occasion chips at the top
 * of /marketplace. Each chip navigates to the collection's drilldown
 * page (route added in Phase C-2 — falls back to a search-style URL
 * for now). Hides itself if no published chip collections have items.
 */
export function OccasionChips() {
  const { collections } = useMarketplaceCollections('chip');
  if (collections.length === 0) return null;

  return (
    <nav
      aria-label="Marketplace collections"
      className="-mx-4 mb-12 overflow-x-auto"
    >
      <ul className="flex gap-2 px-4 pb-2 min-w-max">
        {collections.map((c) => (
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
