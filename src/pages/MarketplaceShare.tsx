import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowLeft, Heart } from 'lucide-react';
import { useMeta } from '@/hooks/useMeta';
import { PageHeader } from '@/components/layout/PageHeader';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { AffiliateDisclosure } from '@/components/marketplace/AffiliateDisclosure';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { useMarketplaceListingsByIds } from '@/hooks/useMarketplaceListingsByIds';

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
      <div className="container mx-auto py-12 md:py-20 px-4">
        <div className="mb-4">
          <LocalizedLink to="/marketplace">
            <Button variant="ghost" size="sm">
              <ArrowLeft style={{ width: 14, height: 14, marginRight: 6 }} aria-hidden="true" />
              Marketplace
            </Button>
          </LocalizedLink>
        </div>
        <PageHeader
          title={title}
          subtitle={
            ids.length > 0
              ? `Shared list of ${ids.length} listing${ids.length === 1 ? '' : 's'}.`
              : 'No listings selected.'
          }
        />

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6">
            {Array.from({ length: Math.max(ids.length, 4) }).map((_, i) => (
              <MarketplaceCard key={i} loading />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Heart style={{ width: 32, height: 32 }} className="mx-auto mb-3" aria-hidden="true" />
            <p className="text-sm">No active listings found for this link.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6">
            {items.map((listing) => (
              <MarketplaceCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}

        <AffiliateDisclosure />
      </div>
    </div>
  );
}
