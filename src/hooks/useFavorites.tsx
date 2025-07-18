import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export type FavoriteType = 'venue' | 'event' | 'tag' | 'marketplace' | 'news';

export const useFavorites = (type: FavoriteType) => {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchFavorites = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      let data, error;
      
      switch (type) {
        case 'venue':
          ({ data, error } = await supabase
            .from('venue_favorites')
            .select('venue_id')
            .eq('user_id', user.id));
          break;
        case 'event':
          ({ data, error } = await supabase
            .from('event_favorites')
            .select('event_id')
            .eq('user_id', user.id));
          break;
        case 'tag':
          ({ data, error } = await supabase
            .from('tag_favorites')
            .select('tag_id')
            .eq('user_id', user.id));
          break;
        case 'marketplace':
          ({ data, error } = await supabase
            .from('marketplace_favorites')
            .select('listing_id')
            .eq('user_id', user.id));
          break;
        case 'news':
          ({ data, error } = await supabase
            .from('news_favorites')
            .select('article_id')
            .eq('user_id', user.id));
          break;
      }

      if (error) throw error;

      const favoriteIds = new Set<string>();
      data?.forEach(item => {
        switch (type) {
          case 'venue':
            favoriteIds.add(item.venue_id);
            break;
          case 'event':
            favoriteIds.add(item.event_id);
            break;
          case 'tag':
            favoriteIds.add(item.tag_id);
            break;
          case 'marketplace':
            favoriteIds.add(item.listing_id);
            break;
          case 'news':
            favoriteIds.add(item.article_id);
            break;
        }
      });
      
      setFavorites(favoriteIds);
    } catch (error) {
      console.error('Error fetching favorites:', error);
      toast({
        title: "Error loading favorites",
        description: "Failed to load your favorites. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (itemId: string) => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to save favorites.",
        variant: "destructive",
      });
      return;
    }

    const isFavorited = favorites.has(itemId);
    
    try {
      if (isFavorited) {
        let error;
        
        switch (type) {
          case 'venue':
            ({ error } = await supabase
              .from('venue_favorites')
              .delete()
              .eq('user_id', user.id)
              .eq('venue_id', itemId));
            break;
          case 'event':
            ({ error } = await supabase
              .from('event_favorites')
              .delete()
              .eq('user_id', user.id)
              .eq('event_id', itemId));
            break;
          case 'tag':
            ({ error } = await supabase
              .from('tag_favorites')
              .delete()
              .eq('user_id', user.id)
              .eq('tag_id', itemId));
            break;
          case 'marketplace':
            ({ error } = await supabase
              .from('marketplace_favorites')
              .delete()
              .eq('user_id', user.id)
              .eq('listing_id', itemId));
            break;
          case 'news':
            ({ error } = await supabase
              .from('news_favorites')
              .delete()
              .eq('user_id', user.id)
              .eq('article_id', itemId));
            break;
        }

        if (error) throw error;

        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(itemId);
          return newSet;
        });

        toast({
          title: "Removed from favorites",
          description: "Item removed from your favorites.",
        });
      } else {
        let error;
        
        switch (type) {
          case 'venue':
            ({ error } = await supabase
              .from('venue_favorites')
              .insert({ user_id: user.id, venue_id: itemId }));
            break;
          case 'event':
            ({ error } = await supabase
              .from('event_favorites')
              .insert({ user_id: user.id, event_id: itemId }));
            break;
          case 'tag':
            ({ error } = await supabase
              .from('tag_favorites')
              .insert({ user_id: user.id, tag_id: itemId }));
            break;
          case 'marketplace':
            ({ error } = await supabase
              .from('marketplace_favorites')
              .insert({ user_id: user.id, listing_id: itemId }));
            break;
          case 'news':
            ({ error } = await supabase
              .from('news_favorites')
              .insert({ user_id: user.id, article_id: itemId }));
            break;
        }

        if (error) throw error;

        setFavorites(prev => new Set(prev).add(itemId));

        toast({
          title: "Added to favorites",
          description: "Item added to your favorites.",
        });
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast({
        title: "Error",
        description: "Failed to update favorite. Please try again.",
        variant: "destructive",
      });
    }
  };

  const isFavorited = (itemId: string) => favorites.has(itemId);

  useEffect(() => {
    fetchFavorites();
  }, [user, type]);

  return {
    favorites,
    loading,
    toggleFavorite,
    isFavorited,
    refetch: fetchFavorites
  };
};