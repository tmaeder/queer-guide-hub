import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useMarketplaceCollectionBySlug } from '@/hooks/useMarketplaceCollections';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { MarketplaceMasthead } from '@/components/marketplace/MarketplaceMasthead';
import { DeadEndTrack } from '@/components/transit/DeadEndTrack';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';

const MarketplaceCollection = () => {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { collection, listings, loading, notFound } = useMarketplaceCollectionBySlug(slug);

  useMeta({
    title: collection?.title ?? 'Collection',
    description: collection?.editor_blurb ?? collection?.subtitle ?? 'A collection on Queer Guide.',
    canonicalPath: collection ? `/marketplace/collection/${collection.slug}` : undefined,
  });

  useBreadcrumbs(
    collection
      ? [
          { label: t('breadcrumb.marketplace', 'Marketplace'), href: '/marketplace' },
          { label: collection.title },
        ]
      : null,
  );

  const listingIds = useMemo(() => listings.map((l) => l.id), [listings]);
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds);

  if (notFound) {
    return (
      <PageContainer>
        <h1 className="font-display text-display leading-[0.95]">No such collection.</h1>
        <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
          This collection may have moved, or it is not published yet.
        </p>
        <DeadEndTrack className="mt-10" label={slug ?? 'Unknown'} type="marketplace" />
        <div className="mt-8">
          <Button asChild>
            <LocalizedLink to="/marketplace" className="no-underline">
              Back to the marketplace
            </LocalizedLink>
          </Button>
        </div>
      </PageContainer>
    );
  }

  if (loading || !collection) {
    return (
      <PageContainer className="flex justify-center">
        <TrackLoader label="Loading" />
      </PageContainer>
    );
  }

  return (
    <div className="min-h-screen">
      <MarketplaceMasthead
        size="page"
        backTo={{ label: 'Marketplace', to: '/marketplace' }}
        eyebrow="Marketplace · Collection"
        title={collection.title}
        lede={collection.subtitle ?? undefined}
        count={`${listings.length.toLocaleString()} item${listings.length !== 1 ? 's' : ''}`}
      >
        {collection.editor_blurb && (
          <p className="mt-8 max-w-reading text-body-lg leading-relaxed">
            {collection.editor_blurb}
          </p>
        )}
      </MarketplaceMasthead>

      <PageContainer>
        {listings.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing in this collection yet.{' '}
            <LocalizedLink to="/marketplace" className="underline underline-offset-4">
              Browse the marketplace
            </LocalizedLink>
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {listings.map((l, i) => (
              <MarketplaceCard
                key={l.id}
                listing={l}
                imageAsset={assets.get(l.id)}
                showFavoriteButton={!!user}
                priority={i < 8}
              />
            ))}
          </div>
        )}
      </PageContainer>
    </div>
  );
};

export default MarketplaceCollection;
