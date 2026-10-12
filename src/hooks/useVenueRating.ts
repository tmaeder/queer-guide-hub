import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useVenueRating(venueId: string) {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ['own-venue-rating', venueId, user?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venue_reviews')
        .select('rating')
        .eq('venue_id', venueId)
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const saveRating = async (rating: number) => {
    if (!user) throw new Error('Sign in to rate this place');
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new Error('Invalid rating');
    const { error } = await supabase.from('venue_reviews').upsert(
      {
        venue_id: venueId,
        user_id: user.id,
        rating,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'venue_id,user_id' },
    );
    if (error) throw error;
    await client.invalidateQueries({ queryKey: key });
    await client.invalidateQueries({ queryKey: ['user-reviews', user.id] });
  };
  return { ...query, saveRating };
}
