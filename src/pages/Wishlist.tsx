import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useMeta } from '@/hooks/useMeta';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useWishlistBySlug } from '@/hooks/useWishlists';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Heart, Share2, Lock, Globe } from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

const Wishlist = () => {
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
  const { assets } = useEntityImageAssets('marketplace_listing', listingIds);

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
      <div className="container mx-auto py-16 px-4">
        <EmptyState
          icon={Heart}
          title="Wishlist not found"
          description="This list may be private or no longer exists."
          mood="neutral"
          primaryAction={{ label: 'Back to marketplace', onClick: () => navigate('/marketplace') }}
        />
      </div>
    );
  }

  if (loading || !wishlist) {
    return (
      <div className="container mx-auto py-16 px-4">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const isOwner = !!user && user.id === wishlist.user_id;
  const VisibilityIcon = wishlist.visibility === 'public' ? Globe : Lock;

  return (
    <div className="min-h-screen">
      <div className="container mx-auto py-12 md:py-16 px-4">
        <header className="mb-12">
          <div className="flex items-center gap-2 text-13 uppercase tracking-wide text-muted-foreground mb-3">
            <VisibilityIcon size={14} aria-hidden="true" />
            <span>{wishlist.visibility} wishlist</span>
          </div>
          <h1 className="text-headline-lg md:text-display font-semibold mb-4">{wishlist.title}</h1>
          {wishlist.description && (
            <p className="text-body-lg text-muted-foreground max-w-2xl">{wishlist.description}</p>
          )}
          <div className="flex items-center gap-3 mt-6">
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
              isOwner ? { label: 'Browse marketplace', onClick: () => navigate('/marketplace') } : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
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
      </div>
    </div>
  );
};

export default Wishlist;
