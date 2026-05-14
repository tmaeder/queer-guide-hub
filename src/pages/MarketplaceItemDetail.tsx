import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/entity/EntityDetailLayout';
import { useAuth } from '@/hooks/useAuth';
import { useMarketplace } from '@/hooks/useMarketplace';
import { useMeta } from '@/hooks/useMeta';
import { toast } from '@/hooks/use-toast';
import {
  fetchMarketplaceListingBundle,
  toggleMarketplaceFavorite,
} from '@/hooks/usePageFetchers';
import {
  type MarketplaceListing,
  type MarketplaceReview,
  MarketplaceHero,
  MarketplaceOverview,
  MarketplaceSidebar,
} from './MarketplaceItemDetail.parts';

interface ListingBundle {
  listing: MarketplaceListing;
  reviews: MarketplaceReview[];
  isFavorited: boolean;
}

async function fetchListingBundle(slug: string, userId: string | undefined): Promise<ListingBundle | null> {
  return fetchMarketplaceListingBundle<MarketplaceListing, MarketplaceReview>(slug, userId);
}

export default function MarketplaceItemDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { incrementViews } = useMarketplace();
  const [isFavorited, setIsFavorited] = useState(false);

  const {
    data,
    isLoading,
    error,
  } = useQuery<ListingBundle | null>({
    queryKey: ['marketplace-detail', slug, user?.id ?? null],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: () => fetchListingBundle(slug!, user?.id),
  });

  const listing = data?.listing ?? null;
  const reviews = data?.reviews ?? [];

  const productJsonLd = listing
    ? {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: listing.title,
        description: listing.description ?? undefined,
        image: listing.images && listing.images.length > 0 ? listing.images : undefined,
        sku: listing.id,
        brand: listing.business_name
          ? { '@type': 'Brand', name: listing.business_name }
          : undefined,
        ...(reviews.length > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: (
                  reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
                ).toFixed(1),
                reviewCount: reviews.length,
              },
            }
          : {}),
        ...(listing.price
          ? {
              offers: {
                '@type': 'Offer',
                price: listing.price,
                priceCurrency: (listing.currency ?? 'USD').toUpperCase(),
                availability:
                  listing.in_stock === false
                    ? 'https://schema.org/OutOfStock'
                    : 'https://schema.org/InStock',
                url: listing.affiliate_url ?? listing.external_url ?? listing.website ?? undefined,
              },
            }
          : {}),
      }
    : undefined;

  useMeta({
    title: listing?.title,
    description: listing?.description?.slice(0, 160),
    ogTitle: listing?.title,
    ogImage: listing?.images?.[0],
    canonicalPath: listing?.slug ? `/marketplace/${listing.slug}` : undefined,
    jsonLd: productJsonLd,
  });

  useEffect(() => {
    if (data) setIsFavorited(data.isFavorited);
  }, [data]);

  useEffect(() => {
    if (listing?.id) incrementViews(listing.id);
  }, [listing?.id, incrementViews]);

  useEffect(() => {
    if (error) {
      toast({
        title: t('common.error', 'Error'),
        description: t('pages.marketplaceDetail.loadFailed', 'Failed to load listing details.'),
        variant: 'destructive',
      });
    }
  }, [error, t]);

  const handleToggleFavorite = async () => {
    if (!user) {
      toast({
        title: t('pages.marketplaceDetail.authRequired', 'Authentication required'),
        description: 'Please sign in to favorite items',
        variant: 'destructive',
      });
      return;
    }
    if (!listing) return;

    try {
      const { error: toggleErr } = await toggleMarketplaceFavorite(
        listing.id,
        user.id,
        isFavorited,
      );
      if (toggleErr) throw toggleErr;
      setIsFavorited(!isFavorited);
      toast({ title: isFavorited ? 'Removed from favorites' : 'Added to favorites' });
    } catch (e) {
      console.error('Error toggling favorite:', e);
      toast({ title: 'Error', description: 'Failed to update favorites', variant: 'destructive' });
    }
  };

  const handleShare = async () => {
    if (!listing) return;
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: listing.title, url: shareUrl });
      } catch {
        /* cancelled */
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: t('pages.marketplaceDetail.linkCopied', 'Link copied'),
        description: t('pages.marketplaceDetail.linkCopiedDesc', 'Listing link copied to clipboard'),
      });
    }
  };

  if (!isLoading && !listing && !error) {
    return (
      <div className="container mx-auto py-8 text-center px-4">
        <h5 className="text-xl font-bold mb-4">Item Not Found</h5>
        <p className="text-muted-foreground mb-6">
          The marketplace item you're looking for doesn't exist.
        </p>
        <LocalizedLink to="/marketplace">
          <Button>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to Marketplace
          </Button>
        </LocalizedLink>
      </div>
    );
  }

  const averageRating = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;
  const heroImage = listing?.images && listing.images.length > 0 ? listing.images[0] : null;

  const breadcrumbs = listing
    ? [
        { label: 'Marketplace', href: '/marketplace' },
        ...(listing.category ? [{ label: listing.category }] : []),
        { label: listing.title },
      ]
    : undefined;

  const tabs: EntityDetailTab[] = listing
    ? [
        {
          id: 'overview',
          label: 'Overview',
          content: <MarketplaceOverview listing={listing} reviews={reviews} t={t} />,
        },
      ]
    : [];

  return (
    <EntityDetailLayout
      loading={isLoading}
      error={(error as Error | null) ?? null}
      breadcrumbs={breadcrumbs}
      hero={
        listing ? (
          <MarketplaceHero
            listing={listing}
            reviewsCount={reviews.length}
            averageRating={averageRating}
            isFavorited={isFavorited}
            onToggleFavorite={handleToggleFavorite}
            onShare={handleShare}
            heroImage={heroImage}
          />
        ) : null
      }
      tabs={tabs}
      sidebar={listing ? <MarketplaceSidebar listing={listing} t={t} /> : undefined}
      entityType="marketplace_listing"
      entityId={listing?.id}
    />
  );
}
