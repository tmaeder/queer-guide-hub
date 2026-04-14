import type { BookingProvider, BookingSearchParams, BookingResult } from '../types';
import { supabase } from '@/integrations/supabase/client';

export const getyourguideProvider: BookingProvider = {
  name: 'getyourguide',
  vertical: 'activity',
  supportsInApp: false,

  async search(params: BookingSearchParams): Promise<BookingResult[]> {
    const { cityName, latitude, longitude, category, checkIn, currency = 'eur', limit = 12 } = params;
    if (!cityName && !latitude) return [];

    const { data, error } = await supabase.functions.invoke('activity-search', {
      body: {
        city: cityName,
        category,
        date: checkIn,
        latitude,
        longitude,
        currency,
        limit,
      },
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
      providerData: activity,
    }));
  },

  getBookingUrl(result: BookingResult): string {
    return result.bookingUrl || 'https://www.getyourguide.com/?partner_id=2PBDXWH';
  },
};
