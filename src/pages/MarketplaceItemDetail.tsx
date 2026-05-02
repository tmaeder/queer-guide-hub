import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EntityDetailLayout, type EntityDetailTab } from '@/components/entity/EntityDetailLayout';
import { useAuth } from '@/hooks/useAuth';
import { useMarketplace } from '@/hooks/useMarketplace';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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
  let { data: listing, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error && /uuid|invalid|no rows/i.test(error.message || '')) {
    const fb = await supabase.from('marketplace_listings').select('*').eq('id', slug).single();
    listing = fb.data;
    error = fb.error;
  }
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  if (!listing) return null;

  const { data: reviews, error: reviewsError } = await supabase
    .from('marketplace_reviews')
    .select(`*, profiles:user_id (display_name, avatar_url)`)
    .eq('listing_id', listing.id)
    .order('created_at', { ascending: false });
  if (reviewsError) throw reviewsError;

  let isFavorited = false;
  if (userId) {
    const { data: fav } = await supabase
      .from('marketplace_favorites')
      .select('id')
      .eq('listing_id', listing.id)
      .eq('user_id', userId)
      .maybeSingle();
    isFavorited = !!fav;
  }

  return {
    listing: listing as MarketplaceListing,
    reviews: (reviews || []) as MarketplaceReview[],
    isFavorited,
  };
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
      if (isFavorited) {
        const { error: delErr } = await supabase
          .from('marketplace_favorites')
          .delete()
          .eq('listing_id', listing.id)
          .eq('user_id', user.id);
        if (delErr) throw delErr;
        setIsFavorited(false);
        toast({ title: 'Removed from favorites' });
      } else {
        const { error: insErr } = await supabase
          .from('marketplace_favorites')
          .insert({ listing_id: listing.id, user_id: user.id });
        if (insErr) throw insErr;
        setIsFavorited(true);
        toast({ title: 'Added to favorites' });
      }
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
      <Container sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
          Item Not Found
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          The marketplace item you're looking for doesn't exist.
        </Typography>
        <LocalizedLink to="/marketplace">
          <Button>
            <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
            Back to Marketplace
          </Button>
        </LocalizedLink>
      </Container>
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
