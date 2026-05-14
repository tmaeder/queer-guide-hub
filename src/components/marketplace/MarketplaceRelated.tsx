import { MarketplaceCard } from './MarketplaceCard';
import { useMarketplaceListingsRelated } from '@/hooks/useMarketplaceQueries';
import { AffiliateDisclosure } from './AffiliateDisclosure';

interface Props {
  limit?: number;
  title?: string;
  className?: string;
}

export function MarketplaceRelated({ limit = 4, title = 'From the marketplace', className }: Props) {
  const { data: items, loading } = useMarketplaceListingsRelated(limit);
  if (loading || items.length === 0) return null;
  return (
    <section aria-labelledby="related-marketplace" className={className ?? 'mt-8'}>
      <h2 id="related-marketplace" className="text-xl font-bold tracking-tight mb-4">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((it) => (
          <MarketplaceCard key={it.id} listing={it} />
        ))}
      </div>
      <AffiliateDisclosure compact />
    </section>
  );
}
