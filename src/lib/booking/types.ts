export type BookingVertical = 'flight' | 'hotel' | 'activity';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'failed';

export interface BookingSearchParams {
  vertical: BookingVertical;
  cityName?: string;
  cityId?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  currency?: string;
  limit?: number;
  /** Flight-specific */
  originIata?: string;
  destinationIata?: string;
  /** Activity-specific */
  category?: string;
}

export interface BookingResult {
  id: string;
  provider: string;
  vertical: BookingVertical;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  price: number;
  originalPrice?: number;
  currency: string;
  rating?: number;
  reviewCount?: number;
  /** For hotels */
  starRating?: number;
  amenities?: string[];
  lgbtqFriendly?: boolean;
  /** For flights */
  originIata?: string;
  destinationIata?: string;
  departureDate?: string;
  returnDate?: string;
  airline?: string;
  stops?: number;
  duration?: number;
  /** For activities */
  durationText?: string;
  category?: string;
  /** Booking action (affiliate redirect) */
  bookingUrl?: string;
  /** Provider-specific raw data */
  providerData?: Record<string, unknown>;
}

export interface BookingProvider {
  name: string;
  vertical: BookingVertical;

  search(params: BookingSearchParams): Promise<BookingResult[]>;
  getBookingUrl?(result: BookingResult): string;
}
