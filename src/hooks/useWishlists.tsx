import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type MarketplaceListing = Database['public']['Tables']['marketplace_listings']['Row'];

export interface Wishlist {
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
}

export interface WishlistItem {
  id: string;
  wishlist_id: string;
  listing_id: string;
  note: string | null;
  position: number;
  added_at: string;
}

// Generates a stable slug from a title. Falls back to a random suffix so
// two users naming a list "Pride 2026" can both succeed.
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'list';
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

export function useWishlists() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setWishlists([]);
      setItems([]);
      return;
    }
    setLoading(true);
    const [wl, it] = await Promise.all([
      supabase
        .from('wishlists')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false }),
      supabase
        .from('wishlist_items')
        .select('*, wishlists!inner(user_id)')
        .eq('wishlists.user_id', user.id),
    ]);
    setWishlists((wl.data ?? []) as Wishlist[]);
    setItems(
      ((it.data ?? []) as Array<WishlistItem & { wishlists?: unknown }>).map(({ wishlists: _w, ...rest }) => rest),
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    refresh();
  }, [refresh]);

  // Map: listingId → Set<wishlistId>
  const membership = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const it of items) {
      const set = m.get(it.listing_id) ?? new Set<string>();
      set.add(it.wishlist_id);
      m.set(it.listing_id, set);
    }
    return m;
  }, [items]);

  const isInAnyWishlist = useCallback(
    (listingId: string) => (membership.get(listingId)?.size ?? 0) > 0,
    [membership],
  );

  const isInWishlist = useCallback(
    (listingId: string, wishlistId: string) =>
      membership.get(listingId)?.has(wishlistId) ?? false,
    [membership],
  );

  const ensureDefaultWishlist = useCallback(async (): Promise<Wishlist | null> => {
    if (!user) return null;
    const existing = wishlists.find((w) => w.is_default);
    if (existing) return existing;
    const slug = `saved-${user.id.replace(/-/g, '').slice(0, 12)}`;
    const { data, error } = await supabase
      .from('wishlists')
      .insert({
        user_id: user.id,
        slug,
        title: 'Saved',
        is_default: true,
        visibility: 'private',
      })
      .select()
      .single();
    if (error || !data) {
      toast({ title: 'Could not create Saved list', description: error?.message, variant: 'destructive' });
      return null;
    }
    setWishlists((prev) => [data as Wishlist, ...prev]);
    return data as Wishlist;
  }, [user, wishlists, toast]);

  const createWishlist = useCallback(
    async (title: string, opts?: { visibility?: 'private' | 'unlisted' | 'public' }): Promise<Wishlist | null> => {
      if (!user) {
        toast({ title: 'Sign in to create a wishlist', variant: 'default' });
        return null;
      }
      const slug = slugify(title);
      const { data, error } = await supabase
        .from('wishlists')
        .insert({
          user_id: user.id,
          slug,
          title: title.trim() || 'Untitled list',
          visibility: opts?.visibility ?? 'private',
        })
        .select()
        .single();
      if (error || !data) {
        toast({ title: 'Could not create list', description: error?.message, variant: 'destructive' });
        return null;
      }
      setWishlists((prev) => [data as Wishlist, ...prev]);
      return data as Wishlist;
    },
    [user, toast],
  );

  const addToWishlist = useCallback(
    async (wishlistId: string, listingId: string) => {
      if (!user) {
        toast({ title: 'Sign in to save listings', variant: 'default' });
        return false;
      }
      // Optimistic
      const optimistic: WishlistItem = {
        id: `tmp-${wishlistId}-${listingId}`,
        wishlist_id: wishlistId,
        listing_id: listingId,
        note: null,
        position: 0,
        added_at: new Date().toISOString(),
      };
      setItems((prev) => [...prev.filter((i) => !(i.wishlist_id === wishlistId && i.listing_id === listingId)), optimistic]);
      const { data, error } = await supabase
        .from('wishlist_items')
        .insert({ wishlist_id: wishlistId, listing_id: listingId })
        .select()
        .single();
      if (error) {
        setItems((prev) => prev.filter((i) => i.id !== optimistic.id));
        toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
        return false;
      }
      setItems((prev) => prev.map((i) => (i.id === optimistic.id ? (data as WishlistItem) : i)));
      return true;
    },
    [user, toast],
  );

  const removeFromWishlist = useCallback(
    async (wishlistId: string, listingId: string) => {
      if (!user) return false;
      // Optimistic
      const prevItems = items;
      setItems((p) => p.filter((i) => !(i.wishlist_id === wishlistId && i.listing_id === listingId)));
      const { error } = await supabase
        .from('wishlist_items')
        .delete()
        .eq('wishlist_id', wishlistId)
        .eq('listing_id', listingId);
      if (error) {
        setItems(prevItems);
        toast({ title: 'Could not remove', description: error.message, variant: 'destructive' });
        return false;
      }
      return true;
    },
    [user, items, toast],
  );

  // Save to default list, creating it if needed. Used by the quick-tap
  // heart so users don't have to interact with the picker on first save.
  const quickSave = useCallback(
    async (listingId: string): Promise<boolean> => {
      const def = await ensureDefaultWishlist();
      if (!def) return false;
      if (isInWishlist(listingId, def.id)) {
        return removeFromWishlist(def.id, listingId);
      }
      return addToWishlist(def.id, listingId);
    },
    [ensureDefaultWishlist, isInWishlist, addToWishlist, removeFromWishlist],
  );

  return {
    wishlists,
    items,
    loading,
    refresh,
    membership,
    isInAnyWishlist,
    isInWishlist,
    ensureDefaultWishlist,
    createWishlist,
    addToWishlist,
    removeFromWishlist,
    quickSave,
  };
}

/**
 * Resolve a wishlist by slug + load its items. Used by the public
 * `/wishlists/:slug` page. Goes via the SECURITY DEFINER RPC so unlisted
 * lists open by-link without leaking through broad SELECT queries.
 */
export function useWishlistBySlug(slug: string | undefined) {
  const [wishlist, setWishlist] = useState<Wishlist | null>(null);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const { data, error } = await supabase.rpc('get_wishlist_by_slug', { p_slug: slug });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        setWishlist(null);
        setListings([]);
        setNotFound(true);
        setLoading(false);
        return;
      }
      setWishlist(row as Wishlist);
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

  return { wishlist, listings, loading, notFound };
}
