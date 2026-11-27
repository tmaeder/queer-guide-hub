import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { shareOrCopy } from '@/lib/share';
import { useMeta } from '@/hooks/useMeta';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useWishlistBySlug } from '@/hooks/useWishlists';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Heart, Share2, Lock, Globe, Link2 } from '@/components/icons';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { PageContainer } from '@/components/layout/PageContainer';
import { WishlistSettings } from '@/components/wishlists/WishlistSettings';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

const Wishlist = () => {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const { wishlist, listings, loading, notFound, failed, itemsFailed, retry } =
    useWishlistBySlug(slug);

  useMeta({
    title: wishlist?.title ?? 'Wishlist',
    description: wishlist?.description ?? 'A wishlist on Queer Guide',
    canonicalPath: wishlist ? `/wishlists/${wishlist.slug}` : undefined,
  });

  const listingIds = useMemo(() => listings.map((l) => l.id), [listings]);
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds, listings);

  // shareOrCopy handles a cancelled share sheet (does nothing) and a failed
  // clipboard write (shows the link so it can be copied by hand).
  const handleShare = () =>
    shareOrCopy({ title: wishlist?.title ?? 'Wishlist', url: window.location.href });

  if (failed) {
    return (
      <PageContainer>
        <EmptyState
          icon={Heart}
          title={t('wishlists.loadFailed', 'This wishlist did not load')}
          description={t('wishlists.loadFailedBody', 'Check your connection and try again.')}
          mood="neutral"
          primaryAction={{ label: t('common.tryAgain', 'Try again'), onClick: retry }}
        />
      </PageContainer>
    );
  }

  if (notFound) {
    return (
      <PageContainer>
        <EmptyState
          icon={Heart}
          title={t('wishlists.notFound', 'Wishlist not found')}
          // One message for missing and private: the server returns nothing
          // for both, and saying which would reveal that a private list exists.
          description={t(
            'wishlists.notFoundBody',
            'This list may be private or no longer exists. If someone shared it with you, ask them for a new link.',
          )}
          mood="neutral"
          primaryAction={{
            label: t('wishlists.backToMarketplace', 'Back to marketplace'),
            onClick: () => navigate('/marketplace'),
          }}
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
  // Who can open this link, per get_wishlist_by_slug(): public and unlisted
  // lists open for anyone with the link; a private list only for its owner.
  const accessNote = {
    public: t('wishlists.access.public', 'Anyone can open this list.'),
    unlisted: t(
      'wishlists.access.unlisted',
      'Anyone with the link can open this list. It is not listed publicly.',
    ),
    private: t(
      'wishlists.access.private',
      'Only you can open this list. Anyone else who follows the link sees a not-found page.',
    ),
  }[wishlist.visibility];
  const canShare = wishlist.visibility !== 'private';

  return (
    <div className="min-h-screen">
      <PageContainer>
        <header className="mb-6 border-b border-border-hairline pb-6">
          <LocalizedLink
            to={isOwner ? '/wishlists' : '/marketplace'}
            className="mb-4 inline-block py-2 text-13 font-medium underline underline-offset-4"
          >
            {isOwner
              ? t('wishlists.title', 'Your wishlists')
              : t('breadcrumb.marketplace', 'Marketplace')}
          </LocalizedLink>
          <div className="flex items-center gap-2 text-13 uppercase tracking-wide text-muted-foreground mb-2">
            <VisibilityIcon size={14} aria-hidden="true" />
            <span>
              {
                {
                  public: t('wishlists.visibility.public', 'Public wishlist'),
                  unlisted: t('wishlists.visibility.unlisted', 'Unlisted wishlist'),
                  private: t('wishlists.visibility.private', 'Private wishlist'),
                }[wishlist.visibility]
              }
            </span>
          </div>
          <h1 className="mb-4 break-words font-display text-headline leading-tight md:text-display">
            {wishlist.title}
          </h1>
          {wishlist.description && (
            <p className="text-body-lg text-muted-foreground max-w-2xl">{wishlist.description}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {isOwner && (
              <Button asChild>
                <LocalizedLink to="/marketplace">
                  {t('wishlists.addItems', 'Add items from the marketplace')}
                </LocalizedLink>
              </Button>
            )}
            {canShare && (
              <Button variant="outline" onClick={() => void handleShare()}>
                <Share2 size={16} aria-hidden="true" />
                {t('wishlists.share', 'Share link')}
              </Button>
            )}
            {!itemsFailed && (
              <span className="text-sm text-muted-foreground">
                {t('wishlists.itemCount', {
                  count: listings.length,
                  defaultValue_one: '{{count}} item',
                  defaultValue_other: '{{count}} items',
                })}
              </span>
            )}
          </div>
          {isOwner && <p className="mt-2 max-w-2xl text-13 text-muted-foreground">{accessNote}</p>}
          {isOwner && (
            <WishlistSettings
              key={`${wishlist.title}|${wishlist.visibility}`}
              id={wishlist.id}
              title={wishlist.title}
              visibility={wishlist.visibility}
              onSaved={retry}
            />
          )}
        </header>

        {itemsFailed ? (
          <EmptyState
            icon={Heart}
            title={t('wishlists.itemsFailed', 'The items in this list did not load')}
            description={t('wishlists.loadFailedBody', 'Check your connection and try again.')}
            mood="neutral"
            primaryAction={{ label: t('common.tryAgain', 'Try again'), onClick: retry }}
          />
        ) : listings.length === 0 ? (
          <EmptyState
            icon={Heart}
            title={t('wishlists.emptyTitle', 'No items yet.')}
            description={
              isOwner
                ? t(
                    'wishlists.emptyOwner',
                    'Save items from the marketplace with the heart button to build this list.',
                  )
                : t('wishlists.emptyVisitor', 'This list is empty.')
            }
            mood="neutral"
            primaryAction={{
              label: t('wishlists.browseMarketplace', 'Browse marketplace'),
              onClick: () => navigate('/marketplace'),
            }}
          />
        ) : (
          <div
            id="wishlist-items"
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
          >
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
