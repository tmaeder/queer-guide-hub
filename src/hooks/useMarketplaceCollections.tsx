import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export interface MarketplaceCollection {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  editor_blurb: string | null;
  status: 'draft' | 'published' | 'archived';
  display_mode: 'chip' | 'hero' | 'rail';
  sort_order: number;
  published_at: string | null;
  pin_until: string | null;
}

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

interface CollectionItem {
  collection_id: string;
  listing_id: string;
  position: number;
  editor_note: string | null;
}

interface CollectionWithCount extends MarketplaceCollection {
  item_count: number;
}

/**
 * All published collections + their item counts. Chips with 0 items are
 * filtered out before render so a freshly-seeded but empty collection
 * doesn't surface an empty rail.
 */
export function useMarketplaceCollections(mode?: 'chip' | 'hero' | 'rail') {
  const [collections, setCollections] = useState<CollectionWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from('marketplace_collections')
        .select('*, marketplace_collection_items(listing_id)')
        .eq('status', 'published')
        .order('sort_order', { ascending: true });
      if (mode) q = q.eq('display_mode', mode);
      const { data, error } = await q;
      if (cancelled || error || !data) {
        if (!cancelled) {
          setCollections([]);
          setLoading(false);
        }
        return;
      }
      type Row = MarketplaceCollection & {
        marketplace_collection_items?: Array<{ listing_id: string }>;
      };
      const enriched: CollectionWithCount[] = (data as unknown as Row[])
        .map((c) => ({
          ...c,
          item_count: c.marketplace_collection_items?.length ?? 0,
        }))
        .filter((c) => c.item_count > 0);
      if (!cancelled) {
        setCollections(enriched);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return { collections, loading };
}

/**
 * Items + full listing rows for a single collection. Used by hero and
 * chip-drilldown surfaces. Honors `position` order set by editors.
 */
export function useMarketplaceCollectionListings(collectionId: string | null, limit = 6) {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!collectionId) {
      setListings([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('marketplace_collection_items')
        .select('position, marketplace_listings(*)')
        .eq('collection_id', collectionId)
        .order('position', { ascending: true })
        .limit(limit);
      if (cancelled) return;
      const rows = (data ?? [])
        .map((r) => (r as { marketplace_listings: MarketplaceListing | null }).marketplace_listings)
        .filter((l): l is MarketplaceListing => !!l);
      setListings(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionId, limit]);

  return { listings, loading };
}

export type { CollectionItem };
