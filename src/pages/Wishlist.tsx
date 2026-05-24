import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useMeta } from '@/hooks/useMeta';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/button';
import { Heart, Share2, Lock, Globe } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

type Wishlist = {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_listing_id: string | null;
  visibility: 'private' | 'unlisted' | 'public';
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

const Wishlist = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useLocalizedNavigate();
  const [wishlist, setWishlist] = useState<Wishlist | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_wishlist_by_slug', { p_slug: slug });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setWishlist(row as Wishlist);
      // Items: pull via wishlist_items join, RLS will filter if needed.
      const { data: items } = await supabase
        .from('wishlist_items')
        .select('listing_id, position, added_at, marketplace_listings(*)')
        .eq('wishlist_id', (row as Wishlist).id)
        .order('position', { ascending: true })
        .order('added_at', { ascending: false });
      if (cancelled) return;
      const rows = (items ?? [])
        .map((r) => (r as { marketplace_listings: MarketplaceListing | null }).marketplace_listings)
        .filter((l): l is MarketplaceListing => !!l);
      setListings(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useMeta({
    title: wishlist?.title ?? 'Wishlist',
    description: wishlist?.description ?? 'A curated wishlist on Queer Guide',
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
