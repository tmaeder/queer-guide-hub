import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTrackView } from '@/hooks/useTrackView';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SinglePage } from '@/components/transit/SinglePage';
import { ProvenanceLine } from '@/components/transit/ProvenanceLine';
import { DeadEndTrack } from '@/components/transit/DeadEndTrack';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { BrandStoryBlock } from '@/components/marketplace/BrandStoryBlock';
import { BrandMoreFrom } from '@/components/marketplace/BrandMoreFrom';
import { PairsWithRail } from '@/components/marketplace/PairsWithRail';
import { useAuth } from '@/hooks/useAuth';
import { useMarketplace } from '@/hooks/useMarketplace';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useSlugRedirect } from '@/hooks/useSlugRedirect';
import { useMeta } from '@/hooks/useMeta';
import { useBreadcrumbs } from '@/contexts/BreadcrumbContext';
import { toast } from '@/hooks/use-toast';
import { fetchMarketplaceListingBundle, toggleMarketplaceFavorite } from '@/hooks/usePageFetchers';
import {
  type MarketplaceListing,
  type MarketplaceReview,
  MarketplaceBuyBox,
  MarketplaceContent,
  ProductFacts,
  ProductTags,
  ProductStats,
  ProductAdminRow,
  CommunityTags,
  MakerCard,
  RatingRings,
  productEyebrow,
} from './MarketplaceItemDetail.parts';
import { MarketplaceGallery } from '@/components/marketplace/MarketplaceGallery';
import { useBrandMoreFrom } from '@/hooks/useMarketplaceBrands';
import { formatListingPrice } from '@/components/marketplace/marketplaceHelpers';
import type { ListingTag } from '@/hooks/usePageFetchers';
import { FeaturedInGuides } from '@/components/guides/FeaturedInGuides';
import { PageContainer } from '@/components/layout/PageContainer';

interface ListingBundle {
  listing: MarketplaceListing;
  reviews: MarketplaceReview[];
  isFavorited: boolean;
  tags: ListingTag[];
}

async function fetchListingBundle(
  slug: string,
  userId: string | undefined,
): Promise<ListingBundle | null> {
  return fetchMarketplaceListingBundle<MarketplaceListing, MarketplaceReview>(slug, userId);
}

// Generic / placeholder category values that carry no information — never shown
// as a breadcrumb crumb.
const GENERIC_CATEGORIES = new Set([
  'products',
  'product',
  'uncategorized',
  'other',
  'misc',
  'general',
  'all',
  'none',
]);

/** Turn a raw listing.category into a clean, linked breadcrumb crumb, or null. */
function buildCategoryCrumb(
  category: string | null | undefined,
): { label: string; href: string } | null {
  const raw = category?.trim();
  if (!raw || GENERIC_CATEGORIES.has(raw.toLowerCase())) return null;
  const label = raw.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, href: `/marketplace/category/${encodeURIComponent(raw.toLowerCase())}` };
}

/**
 * A single listing — /marketplace/:slug.
 *
 * Moved off `EntityDetailLayout`, which is the legacy TABBED shell (its own
 * sibling `EntityDetailScroll` documents it as such). It was rendering a tab
 * bar over exactly one tab — pure chrome — and dragging in Radix Tabs, an
 * AnimatePresence crossfade and a motion scroll bar to do it. `SinglePage` is
 * the spine `src/config/singleModules.ts` already specifies for this type.
 *
 * THE PRIMARY CTA IS RENDERED TWICE, deliberately. `SinglePage`'s rail collapses
 * BELOW the body on mobile, so a phone reader would otherwise pass the gallery,
 * the facts, the description and the reviews before finding a way to buy. The
 * masthead `action` slot carries price + CTA; the rail carries the full buy box.
 * Only the rail copy fires the affiliate impression beacon (`compact` suppresses
 * it), so the duplicate does not double-count.
 */
export default function MarketplaceItemDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const { incrementViews } = useMarketplace();
  const [isFavorited, setIsFavorited] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<ListingBundle | null>({
    queryKey: ['marketplace-detail', slug, user?.id ?? null],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: () => fetchListingBundle(slug!, user?.id),
  });

  const listing = data?.listing ?? null;

  // Merged-duplicate slug redirect (marketplace_slug_redirects); client-side
  // fallback for in-app navigation — the edge middleware handles the 301.
  const redirectListingSlug = useSlugRedirect(
    {
      redirectTable: 'marketplace_slug_redirects',
      redirectIdColumn: 'listing_id',
      entityTable: 'marketplace_listings',
    },
    !isLoading && !listing ? (slug ?? null) : null,
  );
  useEffect(() => {
    if (redirectListingSlug) navigate(`/marketplace/${redirectListingSlug}`, { replace: true });
  }, [redirectListingSlug, navigate]);
  useTrackView({
    type: 'marketplace',
    slug: listing?.slug,
    title: listing?.title,
    image: listing?.images?.[0],
  });
  const reviews = data?.reviews ?? [];

  // Powers the one honest count in the rail's StatLine (module 15).
  const { data: siblings } = useBrandMoreFrom(listing?.brand, listing?.id ?? '', 24);

  const productJsonLd = listing
    ? {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: listing.title,
        description: listing.description ?? undefined,
        image: listing.images && listing.images.length > 0 ? listing.images : undefined,
        sku: listing.id,
        brand:
          listing.brand || listing.business_name
            ? { '@type': 'Brand', name: listing.brand || listing.business_name }
            : undefined,
        ...(reviews.length > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(
                  1,
                ),
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

  const categoryCrumb = buildCategoryCrumb(listing?.category);
  useBreadcrumbs(
    listing
      ? [
          { label: t('breadcrumb.marketplace', 'Marketplace'), href: '/marketplace' },
          ...(categoryCrumb ? [categoryCrumb] : []),
          { label: listing.title },
        ]
      : null,
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
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
        description: t(
          'pages.marketplaceDetail.linkCopiedDesc',
          'Listing link copied to clipboard',
        ),
      });
    }
  };

  if (isLoading) {
    return (
      <PageContainer className="flex justify-center">
        <TrackLoader label={t('common.loading', 'Loading')} />
      </PageContainer>
    );
  }

  if (!listing) {
    return (
      <PageContainer>
        <h1 className="font-display text-display leading-[0.95]">
          {t('pages.marketplaceDetail.notFound', 'No listing here.')}
        </h1>
        <p className="mt-4 max-w-reading text-body-lg text-muted-foreground">
          {t(
            'pages.marketplaceDetail.notFoundLede',
            'This listing has been removed, or the link was mistyped.',
          )}
        </p>
        <DeadEndTrack className="mt-10" label={slug ?? 'Unknown'} type="marketplace" />
        <div className="mt-8 flex flex-wrap gap-2">
          <Button asChild>
            <LocalizedLink to="/marketplace" className="no-underline">
              {t('pages.marketplaceDetail.backToMarketplace', 'Back to the marketplace')}
            </LocalizedLink>
          </Button>
        </div>
      </PageContainer>
    );
  }

  const averageRating = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;
  const tags = data?.tags ?? [];
  const price = formatListingPrice(listing);

  // Bordered ink chip, never a filled track colour — availability is a state,
  // and colour on this page is wayfinding.
  const status =
    listing.in_stock === true
      ? t('marketplace.inStock', 'In stock')
      : listing.in_stock === false
        ? t('marketplace.outOfStock', 'Out of stock')
        : undefined;

  const body = (
    <>
      <MarketplaceGallery listingId={listing.id} images={listing.images} title={listing.title} />
      <ProductFacts listing={listing} />
      <MarketplaceContent listing={listing} reviews={reviews} onContentUpdated={refetch} />
      <FeaturedInGuides entityType="marketplace" entityId={listing.id} />
      {/* NOT wrapped in a SingleSection: BrandStoryBlock renders its own
          `#brand-story` h2, and nesting it would put two headings on one
          block — the second one silently outranking the first. */}
      <BrandStoryBlock listing={listing} />
      <BrandMoreFrom listing={listing} />
      <PairsWithRail listing={listing} />
    </>
  );

  const rail = (
    <>
      <MarketplaceBuyBox listing={listing} />
      <MakerCard listing={listing} />
      <ProductStats listing={listing} siblingCount={siblings?.length ?? null} />
      {/* Spine S6. These listings are machine-ingested from merchant feeds, so
          saying who added the row and when we last checked it is the honest
          floor for a page that asks someone to spend money. */}
      <ProvenanceLine
        addedAt={listing.created_at}
        checkedAt={listing.last_verified_at}
        correctHref="/contact"
      />
      <ProductAdminRow listing={listing} onSaved={refetch} />
    </>
  );

  return (
    <SinglePage
      type="marketplace"
      eyebrow={productEyebrow(listing)}
      title={listing.title}
      status={status}
      lead={
        <span className="flex flex-wrap items-center gap-4">
          <span className="font-display text-headline leading-none tabular-nums">
            {price.primary}
          </span>
          {averageRating > 0 && (
            <span className="flex items-center gap-2 text-15">
              <RatingRings value={averageRating} />
              <span className="tabular-nums">
                {averageRating.toFixed(1)} ({reviews.length})
              </span>
            </span>
          )}
        </span>
      }
      tags={
        <div className="flex flex-col gap-4">
          <CommunityTags listing={listing} />
          <ProductTags tags={tags} />
        </div>
      }
      action={
        <>
          <div className="w-full sm:w-auto">
            <MarketplaceBuyBox listing={listing} compact />
          </div>
          <Button variant="outline" onClick={handleToggleFavorite}>
            {isFavorited ? t('common.saved', 'Saved') : t('common.save', 'Save')}
          </Button>
          <Button variant="outline" onClick={handleShare}>
            {t('common.share', 'Share')}
          </Button>
        </>
      }
      body={body}
      rail={rail}
    />
  );
}
