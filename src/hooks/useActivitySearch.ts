import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BookingResult } from '@/lib/booking/types';

interface UseActivitySearchOptions {
  city?: string | null;
  category?: string;
  date?: string;
  latitude?: number;
  longitude?: number;
  currency?: string;
  limit?: number;
  enabled?: boolean;
}

export function useActivitySearch({
  city,
  category,
  date,
  latitude,
  longitude,
  currency = 'eur',
  limit = 12,
  enabled = true,
}: UseActivitySearchOptions) {
  return useQuery({
    queryKey: ['activity-search', city, category, date, latitude, longitude, currency, limit],
    queryFn: async (): Promise<BookingResult[]> => {
      if (!city && !latitude) return [];

      const { data, error } = await supabase.functions.invoke('activity-search', {
        body: { city, category, date, latitude, longitude, currency, limit },
      });

      if (error || !data?.activities) return [];

      return (data.activities as Record<string, unknown>[]).map((activity, i) => ({
        id: `gyg-${activity.activityId || i}`,
        provider: 'getyourguide',
        vertical: 'activity' as const,
        title: activity.title as string,
        subtitle: activity.abstract as string | undefined,
        imageUrl: activity.imageUrl as string | undefined,
        price: (activity.price as number) || 0,
        originalPrice: activity.originalPrice as number | undefined,
        currency: (activity.currency as string) || currency.toUpperCase(),
        rating: activity.rating as number | undefined,
        reviewCount: activity.reviewCount as number | undefined,
        durationText: activity.duration as string | undefined,
        category: activity.category as string | undefined,
        bookingUrl: activity.bookingUrl as string | undefined,
        supportsInApp: false,
      }));
    },
    enabled: enabled && (!!city || !!latitude),
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
