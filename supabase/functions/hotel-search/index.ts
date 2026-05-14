import { getCorsHeaders, corsResponse, errorResponse, getServiceClient } from "../_shared/supabase-client.ts";

/**
 * Hotel Search Edge Function
 *
 * Searches hotels via Travelpayouts Hotel Data API (replaced defunct Hotellook).
 * Generates Booking.com affiliate links via Travelpayouts marker.
 *
 * Data sources (in order):
 * 1. Travelpayouts Hotel Selections API (curated lists by city)
 * 2. Travelpayouts Hotel Cache API (price data)
 * 3. Fallback: Booking.com search link with affiliate marker
 */

const MARKER = '452012';
const TP_BASE = 'https://engine.hotellook.com/api/v2'; // Still serves cached data via TP
const BOOKING_AFFILIATE_BASE = 'https://www.booking.com/searchresults.html';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    let city: string, checkIn: string | undefined, checkOut: string | undefined;
    let guests: number, currency: string, limit: number;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      city = url.searchParams.get('city') || '';
      checkIn = url.searchParams.get('checkIn') || undefined;
      checkOut = url.searchParams.get('checkOut') || undefined;
      guests = parseInt(url.searchParams.get('guests') || '2');
      currency = url.searchParams.get('currency') || 'eur';
      limit = parseInt(url.searchParams.get('limit') || '12');
    } else {
      const body = await req.json();
      city = body.city || '';
      checkIn = body.checkIn;
      checkOut = body.checkOut;
      guests = body.guests || 2;
      currency = body.currency || 'eur';
      limit = body.limit || 12;
    }

    if (!city) {
      return errorResponse('City name is required', 400, req);
    }

    const apiToken = Deno.env.get('TRAVELPAYOUTS_API_TOKEN');
    if (!apiToken) {
      return errorResponse('Internal server error', 500, req);
    }

    // Try multiple data sources
    let hotels = await searchViaTPCache(city, checkIn, checkOut, currency, limit, apiToken);

    if (hotels.length === 0) {
      hotels = await searchViaTPLookup(city, currency, limit, apiToken);
    }

    // If still no results, return Booking.com search link as single result
    if (hotels.length === 0) {
      hotels = [buildBookingFallback(city, checkIn, checkOut, guests, currency)];
    }

    // Cross-reference with our own hotels table for LGBTQ+ friendly flags
    try {
      const supabase = getServiceClient();
      const { data: ourHotels } = await supabase
        .from('hotels')
        .select('name, lgbtq_friendly, queer_safety_notes')
        .ilike('city', `%${city}%`)
        .limit(50);

      if (ourHotels && ourHotels.length > 0) {
        const lgbtqMap = new Map(ourHotels.map(h => [h.name?.toLowerCase(), h]));
        for (const hotel of hotels) {
          const match = lgbtqMap.get((hotel.hotelName as string)?.toLowerCase());
          if (match) {
            hotel.lgbtqFriendly = match.lgbtq_friendly || false;
            hotel.safetyNotes = match.queer_safety_notes;
          }
        }
      }
    } catch { /* non-critical */ }

    return new Response(JSON.stringify({ success: true, hotels, city }), {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800, s-maxage=1800',
      },
    });
  } catch (error) {
    console.error('Hotel search error:', error);
    return errorResponse('Internal server error', 500, req);
  }
});

/**
 * Search via Travelpayouts cache endpoint (still operational post-Hotellook closure)
 */
async function searchViaTPCache(
  city: string, checkIn: string | undefined, checkOut: string | undefined,
  currency: string, limit: number, token: string,
): Promise<Record<string, unknown>[]> {
  const url = new URL(`${TP_BASE}/cache.json`);
  url.searchParams.set('location', city);
  url.searchParams.set('currency', currency);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('token', token);
  if (checkIn) url.searchParams.set('checkIn', checkIn);
  if (checkOut) url.searchParams.set('checkOut', checkOut);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return [];

    return data.slice(0, limit).map((h: Record<string, unknown>) => ({
      hotelId: h.hotelId || h.hotel_id,
      hotelName: h.hotelName || h.hotel_name || 'Hotel',
      location: city,
      stars: h.stars,
      rating: h.rating || h.hotel_rating,
      reviews: h.reviews_amount,
      priceFrom: h.priceFrom || h.price_from || h.price,
      priceOld: h.priceOld,
      currency: currency.toUpperCase(),
      photoUrl: h.hotel_id ? `https://photo.hotellook.com/image_v2/crop/h${h.hotel_id}_0/640/480.auto` : undefined,
      bookingUrl: buildBookingUrl(h.hotelName as string || city, city, checkIn, checkOut),
      lgbtqFriendly: false,
    }));
  } catch {
    return [];
  }
}

/**
 * Search via TP lookup + selections (for city-based browsing)
 */
async function searchViaTPLookup(
  city: string, currency: string, limit: number, token: string,
): Promise<Record<string, unknown>[]> {
  // Resolve city to location ID
  const lookupUrl = new URL(`${TP_BASE}/lookup.json`);
  lookupUrl.searchParams.set('query', city);
  lookupUrl.searchParams.set('lang', 'en');
  lookupUrl.searchParams.set('lookFor', 'city');
  lookupUrl.searchParams.set('limit', '1');
  lookupUrl.searchParams.set('token', token);

  try {
    const lookupRes = await fetch(lookupUrl.toString());
    if (!lookupRes.ok) return [];
    const lookupData = await lookupRes.json();
    const locations = lookupData.results?.locations || [];
    if (locations.length === 0) return [];

    const locationId = locations[0].id || locations[0].cityId;
    if (!locationId) return [];

    // Get hotel selections for this location
    const selectUrl = new URL('https://yasen.hotellook.com/tp/public/widget_location_dump.json');
    selectUrl.searchParams.set('currency', currency.toLowerCase());
    selectUrl.searchParams.set('language', 'en');
    selectUrl.searchParams.set('limit', String(limit));
    selectUrl.searchParams.set('id', String(locationId));
    selectUrl.searchParams.set('type', 'popularity');
    selectUrl.searchParams.set('marker', MARKER);

    const selectRes = await fetch(selectUrl.toString());
    if (!selectRes.ok) return [];
    const hotels = await selectRes.json();
    if (!Array.isArray(hotels) || hotels.length === 0) return [];

    return hotels.slice(0, limit).map((h: Record<string, unknown>) => ({
      hotelId: h.id,
      hotelName: h.name,
      location: city,
      stars: h.stars,
      rating: h.rating,
      reviews: h.reviews_amount,
      priceFrom: h.priceFrom,
      priceOld: h.priceOld,
      currency: currency.toUpperCase(),
      photoUrl: h.photoId ? `https://photo.hotellook.com/image_v2/crop/h${h.id}_${h.photoId}/640/480.auto` : undefined,
      bookingUrl: buildBookingUrl(h.name as string || '', city, undefined, undefined),
      lgbtqFriendly: false,
    }));
  } catch {
    return [];
  }
}

/**
 * Build Booking.com affiliate search URL
 */
function buildBookingUrl(
  hotelName: string, city: string,
  checkIn?: string, checkOut?: string,
): string {
  const params = new URLSearchParams();
  params.set('ss', hotelName || city);
  params.set('aid', '2381426'); // Travelpayouts Booking.com sub-affiliate
  params.set('label', `queerguide-${MARKER}`);
  if (checkIn) params.set('checkin', checkIn);
  if (checkOut) params.set('checkout', checkOut);
  return `${BOOKING_AFFILIATE_BASE}?${params.toString()}`;
}

function buildBookingFallback(
  city: string, checkIn: string | undefined, checkOut: string | undefined,
  guests: number, currency: string,
): Record<string, unknown> {
  return {
    hotelId: `search-${city}`,
    hotelName: `Search hotels in ${city}`,
    location: city,
    stars: null,
    rating: null,
    reviews: null,
    priceFrom: null,
    currency: currency.toUpperCase(),
    bookingUrl: buildBookingUrl(city, city, checkIn, checkOut),
    lgbtqFriendly: false,
    isFallback: true,
  };
}
