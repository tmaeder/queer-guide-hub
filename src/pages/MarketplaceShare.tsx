import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useMeta } from '@/hooks/useMeta';
import { MarketplaceMasthead } from '@/components/marketplace/MarketplaceMasthead';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { AffiliateDisclosure } from '@/components/marketplace/AffiliateDisclosure';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMarketplaceListingsByIds } from '@/hooks/useMarketplaceListingsByIds';
import { PageContainer } from '@/components/layout/PageContainer';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function MarketplaceShare() {
  const [params] = useSearchParams();
  const rawIds = params.get('ids') ?? '';
  const title = params.get('title') ?? 'Shared marketplace list';

  const ids = useMemo(
    () =>
      rawIds
        .split(',')
        .map((s) => s.trim())
        .filter((s) => UUID_RE.test(s))
        .slice(0, 50),
    [rawIds],
  );

  const { data: items, loading } = useMarketplaceListingsByIds(ids);

  useMeta({
    title: `${title} — Marketplace`,
    description: `A shared list of ${ids.length} marketplace listings on Queer Guide.`,
    canonicalPath: undefined, // shared links should not be indexed
  });

  return (
    <div className="min-h-screen">
      <MarketplaceMasthead
        size="page"
        backTo={{ label: 'Marketplace', to: '/marketplace' }}
        eyebrow="Marketplace · Shared list"
        title={title}
        count={`${ids.length.toLocaleString()} listing${ids.length === 1 ? '' : 's'} shared`}
      />

      <PageContainer>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6">
            {Array.from({ length: Math.max(ids.length, 4) }).map((_, i) => (
              <MarketplaceCard key={i} loading />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">
            No active listings found for this link — they may have sold out or been removed.{' '}
            <LocalizedLink to="/marketplace" className="underline underline-offset-4">
              Browse the marketplace
            </LocalizedLink>
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6">
            {items.map((listing) => (
              <MarketplaceCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}

        <AffiliateDisclosure />
      </PageContainer>
    </div>
  );
}
