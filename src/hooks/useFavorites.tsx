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

    const fetchFavorites = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from(config.table as 'venues')
        .select(config.idColumn)
        .eq('user_id', user.id);

      if (!cancelled) {
        if (!error && data) {
          setFavoriteIds(new Set(data.map((row: Record<string, unknown>) => row[config.idColumn] as string)));
        }
        setLoading(false);
      }
    };

    fetchFavorites();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config derived from type; config?.table and config?.idColumn already cover it
  }, [user, config?.table, config?.idColumn]);

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
          // Revert
          setFavoriteIds((prev) => new Set([...prev, itemId]));
          toast({ title: 'Failed to remove favorite', variant: 'destructive' });
        }
      } else {
        const { error } = await supabase
          .from(config.table as 'venues')
          .insert({ user_id: user.id, [config.idColumn]: itemId } as Record<string, unknown>);

        if (error) {
          // Revert
          setFavoriteIds((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          });
          toast({ title: 'Failed to add favorite', variant: 'destructive' });
        }
      }
    },
    [user, config, favoriteIds, toast],
  );

  return { isFavorited, toggleFavorite, loading, favoriteIds };
}
