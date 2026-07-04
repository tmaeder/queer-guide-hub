import { useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketplaceCard } from './MarketplaceCard';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import type { MarketplaceSurface } from '@/lib/affiliate/marketplace';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'] & {
  venues?: { name: string; address: string; city: string } | null;
};

interface MarketplaceRailShellProps {
  /** aria-labelledby anchor; must be unique per page. */
  id: string;
  title: string;
  subtitle?: string;
  listings: MarketplaceListing[];
  loading?: boolean;
  /** Attribution surface for outbound /go links on every card in the rail. */
  surface: MarketplaceSurface;
  showFavoriteButton?: boolean;
  className?: string;
}

/**
 * Presentational horizontal snap-scroll rail for marketplace listings.
 * Data-agnostic — every contextual rail (curated rows, city/event/trip,
 * home) feeds it listings and a surface for CTR attribution.
 */
export function MarketplaceRailShell({
  id,
  title,
  subtitle,
  listings,
  loading = false,
  surface,
  showFavoriteButton,
  className,
}: MarketplaceRailShellProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const listingIds = useMemo(() => listings.map((l) => l.id), [listings]);
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds);

  if (!loading && listings.length === 0) return null;

  const scroll = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(320, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className={className ?? 'mb-16 lg:mb-24'} aria-labelledby={`row-${id}`}>
      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <h2 id={`row-${id}`} className="font-display text-headline-lg tracking-tight">
            {title}
          </h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="hidden md:flex gap-1.5">
          <Button variant="outline" size="icon" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="icon" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin"
        style={{ scrollPaddingLeft: '0.25rem' }}
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="snap-start shrink-0 w-[280px] sm:w-[320px]">
                <MarketplaceCard loading />
              </div>
            ))
          : listings.map((listing) => (
              <div key={listing.id} className="snap-start shrink-0 w-[280px] sm:w-[320px]">
                <MarketplaceCard
                  listing={listing}
                  imageAsset={assets.get(listing.id)}
                  showFavoriteButton={showFavoriteButton}
                  surface={surface}
                />
              </div>
            ))}
      </div>
    </section>
  );
}
