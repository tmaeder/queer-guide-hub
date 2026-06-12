import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UserReview {
  id: string;
  kind: 'venue' | 'marketplace';
  rating: number;
  title: string | null;
  content: string | null;
  created_at: string;
  target_name: string;
  target_link: string | null;
}

/**
 * All reviews a user wrote, across venues + marketplace. First-ever per-user
 * aggregation — reviews were previously only visible on the reviewed entity.
 */
export function useUserReviews(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['user-reviews', userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<UserReview[]> => {
      const [venue, marketplace] = await Promise.all([
        supabase
          .from('venue_reviews')
          .select('id, rating, title, content, created_at, venues(name, slug)')
          .eq('user_id', userId!)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('marketplace_reviews')
          .select('id, rating, title, content, created_at, marketplace_listings(title, slug)')
          .eq('user_id', userId!)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      const out: UserReview[] = [];
      for (const r of venue.data ?? []) {
        const v = r.venues as unknown as { name: string; slug: string | null } | null;
        out.push({
          id: r.id,
          kind: 'venue',
          rating: r.rating,
          title: r.title,
          content: r.content,
          created_at: r.created_at,
          target_name: v?.name ?? 'Venue',
          target_link: v?.slug ? `/venues/${v.slug}` : null,
        });
      }
      for (const r of marketplace.data ?? []) {
        const l = r.marketplace_listings as unknown as { title: string; slug: string | null } | null;
        out.push({
          id: r.id,
          kind: 'marketplace',
          rating: r.rating,
          title: r.title,
          content: r.content,
          created_at: r.created_at,
          target_name: l?.title ?? 'Listing',
          target_link: l?.slug ? `/marketplace/${l.slug}` : null,
        });
      }
      return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });
}
