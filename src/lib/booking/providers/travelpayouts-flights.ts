import type { BookingProvider, BookingSearchParams, BookingResult } from '../types';
import { buildAviasalesUrl } from '@/utils/aviasalesUrl';
import { supabase } from '@/integrations/supabase/client';

export const travelpayoutsFlights: BookingProvider = {
  name: 'travelpayouts',
  vertical: 'flight',
  supportsInApp: false,

  async search(params: BookingSearchParams): Promise<BookingResult[]> {
    const { originIata, destinationIata, _checkIn, currency = 'eur', limit = 9 } = params;
    if (!originIata) return [];

    const body: Record<string, unknown> = {
      origin: originIata,
      type: destinationIata ? 'flights' : 'popular_routes',
      currency,
      limit,
    };
    if (destinationIata) body.destination = destinationIata;

    const { data, error } = await supabase.functions.invoke('travel-deals', { body });
    if (error || !data?.deals) return [];

    return (data.deals as Record<string, unknown>[]).map((deal, i) => {
      const url = buildAviasalesUrl({
        origin: deal.origin as string,
        destination: deal.destination as string,
        departDate: deal.departure_date as string | undefined,
        returnDate: deal.return_date as string | undefined,
      });

      return {
        id: `tp-flight-${deal.origin}-${deal.destination}-${i}`,
        provider: 'travelpayouts',
        vertical: 'flight' as const,
        title: `${deal.origin} → ${deal.destination}`,
        price: deal.price as number,
        currency: (deal.currency as string) || currency,
        originIata: deal.origin as string,
        destinationIata: deal.destination as string,
        departureDate: deal.departure_date as string | undefined,
        returnDate: deal.return_date as string | undefined,
        airline: deal.airline as string | undefined,
        stops: (deal.stops as number) || 0,
        duration: deal.duration as number | undefined,
        bookingUrl: url.url || (deal.affiliate_url as string),
        supportsInApp: false,
        providerData: deal,
      };
    });
  },

  getBookingUrl(result: BookingResult): string {
    return result.bookingUrl || 'https://www.aviasales.com/?marker=452012';
  },
};
