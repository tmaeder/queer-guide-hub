import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useMeta } from '@/hooks/useMeta';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useWishlistBySlug } from '@/hooks/useWishlists';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Heart, Share2, Lock, Globe, Link2 } from '@/components/icons';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

const Wishlist = () => {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useLocalizedNavigate();
  const { wishlist, listings, loading, notFound } = useWishlistBySlug(slug);

  useMeta({
    title: wishlist?.title ?? 'Wishlist',
    description: wishlist?.description ?? 'A wishlist on Queer Guide',
    canonicalPath: wishlist ? `/wishlists/${wishlist.slug}` : undefined,
  });

  const listingIds = useMemo(() => listings.map((l) => l.id), [listings]);
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds, listings);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: wishlist?.title ?? 'Wishlist', url });
        return;
      } catch {
        // user cancelled — fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    toast({ title: 'Link copied' });
  };

  if (notFound) {
    return (
      <PageContainer>
        <EmptyState
          icon={Heart}
          title="Wishlist not found"
          description="This list may be private or no longer exists."
          mood="neutral"
          primaryAction={{ label: 'Back to marketplace', onClick: () => navigate('/marketplace') }}
        />
      </PageContainer>
    );
  }

  if (loading || !wishlist) {
    return (
      <PageContainer>
        <PageLoadingState count={4} label="Loading this wishlist" />
      </PageContainer>
    );
  }

  const isOwner = !!user && user.id === wishlist.user_id;
  const VisibilityIcon = { public: Globe, unlisted: Link2, private: Lock }[wishlist.visibility];

  return (
    <div className="min-h-screen">
      <PageContainer>
        <header className="mb-6 border-b border-border-hairline pb-6">
          <LocalizedLink to={isOwner ? '/wishlists' : '/marketplace'} className="mb-4 inline-block py-2 text-13 font-medium underline underline-offset-4">
            {isOwner ? t('wishlists.title', 'Your wishlists') : t('breadcrumb.marketplace', 'Marketplace')}
          </LocalizedLink>
          <div className="flex items-center gap-2 text-13 uppercase tracking-wide text-muted-foreground mb-2">
            <VisibilityIcon size={14} aria-hidden="true" />
            <span>{wishlist.visibility} wishlist</span>
          </div>
          <h1 className="mb-4 break-words font-display text-headline leading-tight md:text-display">{wishlist.title}</h1>
          {wishlist.description && (
            <p className="text-body-lg text-muted-foreground max-w-2xl">{wishlist.description}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {listings.length > 0 && (
              <Button asChild>
                <a href="#wishlist-items">{t('wishlists.browseItems', 'Browse items')}</a>
              </Button>
            )}
            <Button variant="outline" onClick={handleShare}>
              <Share2 size={16} />
              Share
            </Button>
            <span className="text-sm text-muted-foreground">
              {listings.length} item{listings.length === 1 ? '' : 's'}
            </span>
          </div>
        </header>

        {listings.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="No items yet."
            description={
              isOwner
                ? 'Save items from the marketplace to build this list.'
                : 'This list is empty.'
            }
            mood="neutral"
            primaryAction={
              isOwner
                ? { label: 'Browse marketplace', onClick: () => navigate('/marketplace') }
                : undefined
            }
          />
        ) : (
          <div id="wishlist-items" className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {listings.map((listing, i) => (
              <MarketplaceCard
                key={listing.id}
                listing={listing}
                imageAsset={assets.get(listing.id)}
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

export default Wishlist;
