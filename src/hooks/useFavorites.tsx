import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTrackEvent } from '@/hooks/useTrackEvent';

export type FavoriteType =
  | 'venue'
  | 'event'
  | 'city'
  | 'country'
  | 'marketplace'
  | 'news'
  | 'tag'
  | 'queer_village';

const tableMap: Record<FavoriteType, { table: string; idColumn: string }> = {
  venue: { table: 'venue_favorites', idColumn: 'venue_id' },
  event: { table: 'event_favorites', idColumn: 'event_id' },
  city: { table: 'city_favorites', idColumn: 'city_id' },
  country: { table: 'country_favorites', idColumn: 'country_id' },
  marketplace: { table: 'marketplace_favorites', idColumn: 'listing_id' },
  news: { table: 'news_favorites', idColumn: 'article_id' },
  tag: { table: 'tag_favorites', idColumn: 'tag_id' },
  queer_village: { table: 'venue_favorites', idColumn: 'venue_id' },
};

// Per-user×type request cache. Multiple useFavorites callers in the same
// page (one per card on /events, /venues, etc.) collapse to a single
// network round-trip and share the resulting Set. Without this, a 24-card
// grid issues 24 identical SELECTs against event_favorites.
const FAVORITES_CACHE = new Map<string, Promise<Set<string>>>();

function fetchFavoritesOnce(
  type: FavoriteType,
  userId: string,
  config: { table: string; idColumn: string },
): Promise<Set<string>> {
  const key = `${type}:${userId}`;
  const cached = FAVORITES_CACHE.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const { data, error } = await supabase
      .from(config.table as 'venues')
      .select(config.idColumn)
      .eq('user_id', userId);
    if (error || !data) return new Set<string>();
    return new Set<string>(
      data.map((row: Record<string, unknown>) => row[config.idColumn] as string),
    );
  })().catch(() => new Set<string>());

  FAVORITES_CACHE.set(key, promise);
  // After the in-flight fetch resolves we keep the cached Promise so further
  // calls during the same session reuse it without another network hit. A
  // mutation (toggleFavorite) clears the cache so the next mount refetches.
  return promise;
}

function invalidateFavoritesCache(type: FavoriteType, userId: string) {
  FAVORITES_CACHE.delete(`${type}:${userId}`);
}

export function useFavorites(type: FavoriteType) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { track } = useTrackEvent();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const config = tableMap[type];

  useEffect(() => {
    if (!user || !config) return;
    let cancelled = false;
    setLoading(true);
    fetchFavoritesOnce(type, user.id, config).then((set) => {
      if (cancelled) return;
      setFavoriteIds(set);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // user object is recreated on each auth-state change but user.id is
    // stable; depend on the id to avoid re-firing the fetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, type]);

  const isFavorited = useCallback((itemId: string) => favoriteIds.has(itemId), [favoriteIds]);

  const toggleFavorite = useCallback(
    async (itemId: string) => {
      if (!user) {
        toast({ title: 'Sign in to save favorites', variant: 'default' });
        return;
      }
      if (!config) return;

      const currentlyFavorited = favoriteIds.has(itemId);

      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (currentlyFavorited) next.delete(itemId);
        else next.add(itemId);
        return next;
      });

      track({
        eventType: currentlyFavorited ? 'favorite_remove' : 'favorite_add',
        entityType: type as 'venue' | 'event' | 'city' | 'country',
        entityId: itemId,
      });

      if (currentlyFavorited) {
        const { error } = await supabase
          .from(config.table as 'venues')
          .delete()
          .eq('user_id', user.id)
          .eq(config.idColumn, itemId);

        if (error) {
          setFavoriteIds((prev) => new Set([...prev, itemId]));
          toast({ title: 'Failed to remove favorite', variant: 'destructive' });
        } else {
          invalidateFavoritesCache(type, user.id);
        }
      } else {
        const { error } = await supabase
          .from(config.table as 'venues')
          .insert({ user_id: user.id, [config.idColumn]: itemId } as Record<string, unknown>);

        if (error) {
          setFavoriteIds((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          });
          toast({ title: 'Failed to add favorite', variant: 'destructive' });
        } else {
          invalidateFavoritesCache(type, user.id);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, config, favoriteIds, toast],
  );

  return { isFavorited, toggleFavorite, loading, favoriteIds };
}
