import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarketplaceCard } from './MarketplaceCard';
import { useMarketplaceRow, type CuratedRowKey } from '@/hooks/useMarketplaceRows';
import { useCuratedIds } from './CuratedIdsContext';

interface MarketplaceRowProps {
  rowKey: CuratedRowKey;
  title: string;
  subtitle?: string;
  limit?: number;
  showFavoriteButton?: boolean;
  onToggleFavorite?: (id: string) => void;
}

export function MarketplaceRow({
  rowKey,
  title,
  subtitle,
  limit = 12,
  showFavoriteButton,
}: MarketplaceRowProps) {
  const { data, loading, error } = useMarketplaceRow(rowKey, limit);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { register } = useCuratedIds();

  useEffect(() => {
    register(rowKey, data.map((l) => l.id));
  }, [rowKey, data, register]);

  if (!loading && (error || data.length === 0)) return null;

  const scroll = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(320, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="mb-12" aria-labelledby={`row-${rowKey}`}>
      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <h2 id={`row-${rowKey}`} className="text-2xl font-bold tracking-tight">
            {title}
          </h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="hidden md:flex gap-1.5">
          <Button variant="outline" size="icon" onClick={() => scroll(-1)} aria-label={`Scroll ${title} left`}>
            <ChevronLeft style={{ width: 16, height: 16 }} />
          </Button>
          <Button variant="outline" size="icon" onClick={() => scroll(1)} aria-label={`Scroll ${title} right`}>
            <ChevronRight style={{ width: 16, height: 16 }} />
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
          : data.map((listing) => (
              <div key={listing.id} className="snap-start shrink-0 w-[280px] sm:w-[320px]">
                <MarketplaceCard listing={listing} showFavoriteButton={showFavoriteButton} />
              </div>
            ))}
      </div>
    </section>
  );
}
