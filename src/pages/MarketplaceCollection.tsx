import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useMarketplaceCollectionBySlug } from '@/hooks/useMarketplaceCollections';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Store } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

const MarketplaceCollection = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const { collection, listings, loading, notFound } = useMarketplaceCollectionBySlug(slug);

  useMeta({
    title: collection?.title ?? 'Collection',
    description: collection?.editor_blurb ?? collection?.subtitle ?? 'A collection on Queer Guide.',
    canonicalPath: collection ? `/marketplace/collection/${collection.slug}` : undefined,
  });

  const listingIds = useMemo(() => listings.map((l) => l.id), [listings]);
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds);

  if (notFound) {
    return (
      <div className="container mx-auto py-16 px-4">
        <EmptyState
          icon={Store}
          title="Collection not found"
          description="This collection may have moved or is not yet published."
          mood="neutral"
          primaryAction={{ label: 'Back to marketplace', onClick: () => navigate('/marketplace') }}
        />
      </div>
    );
  }

  if (loading || !collection) {
    return (
      <div className="container mx-auto py-16 px-4">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="container mx-auto py-12 md:py-16 px-4">
        <header className="mb-12 max-w-3xl">
          <p className="text-13 uppercase tracking-wide text-muted-foreground mb-3">Collection</p>
          <h1 className="text-headline-lg md:text-display font-semibold mb-4 leading-tight">
            {collection.title}
          </h1>
          {collection.subtitle && (
            <p className="text-body-lg text-muted-foreground">{collection.subtitle}</p>
          )}
          {collection.editor_blurb && (
            <p className="mt-4 text-body-lg leading-relaxed max-w-prose">
              {collection.editor_blurb}
            </p>
          )}
        </header>

        {listings.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No items in this collection yet."
            description="Check back soon — editors are picking the lineup."
            mood="neutral"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
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
      </div>
    </div>
  );
};

export default MarketplaceCollection;
