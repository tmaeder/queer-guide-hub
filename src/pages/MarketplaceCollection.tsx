import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useMeta';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { MarketplaceCard } from '@/components/marketplace/MarketplaceCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Store } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];
type CollectionRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  editor_blurb: string | null;
  cover_image_url: string | null;
};

const MarketplaceCollection = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useLocalizedNavigate();
  const [collection, setCollection] = useState<CollectionRow | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: col } = await supabase
        .from('marketplace_collections')
        .select('id, slug, title, subtitle, editor_blurb, cover_image_url')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();
      if (cancelled) return;
      if (!col) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCollection(col as CollectionRow);
      const { data: items } = await supabase
        .from('marketplace_collection_items')
        .select('position, marketplace_listings(*)')
        .eq('collection_id', (col as CollectionRow).id)
        .order('position', { ascending: true });
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
    title: collection?.title ?? 'Collection',
    description: collection?.editor_blurb ?? collection?.subtitle ?? 'A curated collection on Queer Guide.',
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
