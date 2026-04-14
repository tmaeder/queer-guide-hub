import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, corsResponse, errorResponse } from "../_shared/supabase-client.ts";

const MARKER = '452012';
const HOTELLOOK_BASE = 'https://engine.hotellook.com/api/v2';

serve(async (req) => {
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

    // Step 1: Resolve city to Hotellook location ID
    const locationId = await resolveCity(city, apiToken);
    if (!locationId) {
      return new Response(JSON.stringify({ success: true, hotels: [], city }), {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Search hotels
    const hotels = await searchHotels(locationId, city, checkIn, checkOut, guests, currency, limit, apiToken);

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

async function resolveCity(city: string, token: string): Promise<string | null> {
  const url = new URL(`${HOTELLOOK_BASE}/lookup.json`);
  url.searchParams.set('query', city);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('lookFor', 'city');
  url.searchParams.set('limit', '1');
  url.searchParams.set('token', token);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error('Hotellook lookup error:', res.status);
    return null;
  }

  const data = await res.json();
  const results = data.results?.locations || [];
  if (results.length === 0) return null;

  return results[0].id || results[0].cityId || null;
}

async function searchHotels(
  locationId: string,
  cityName: string,
  checkIn: string | undefined,
  checkOut: string | undefined,
  guests: number,
  currency: string,
  limit: number,
  token: string,
): Promise<unknown[]> {
  // Use cache/prices endpoint for quick results (no dates required)
  const url = new URL('https://yasen.hotellook.com/tp/public/widget_location_dump.json');
  url.searchParams.set('currency', currency.toLowerCase());
  url.searchParams.set('language', 'en');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('id', locationId);
  url.searchParams.set('type', 'popularity');
  url.searchParams.set('marker', MARKER);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error('Hotellook widget dump error:', res.status);
    return fallbackHotelSearch(cityName, currency, limit, token);
  }

  const hotels = await res.json();
  if (!Array.isArray(hotels) || hotels.length === 0) {
    return fallbackHotelSearch(cityName, currency, limit, token);
  }

  return hotels.slice(0, limit).map((h: Record<string, unknown>) => ({
    hotelId: h.id,
    hotelName: h.name,
    location: `${cityName}`,
    stars: h.stars,
    rating: h.rating,
    reviews: h.reviews_amount,
    priceFrom: h.priceFrom,
    priceOld: h.priceOld,
    currency: currency.toUpperCase(),
    photoUrl: h.photoId ? `https://photo.hotellook.com/image_v2/crop/h${h.id}_${h.photoId}/640/480.auto` : undefined,
    bookingUrl: buildHotelBookingUrl(h.id as string, cityName, checkIn, checkOut),
    lgbtqFriendly: false,
  }));
}

async function fallbackHotelSearch(
  city: string,
  currency: string,
  limit: number,
  token: string,
): Promise<unknown[]> {
  const url = new URL(`${HOTELLOOK_BASE}/cache.json`);
  url.searchParams.set('location', city);
  url.searchParams.set('currency', currency);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('token', token);

  const res = await fetch(url.toString());
  if (!res.ok) return [];

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.slice(0, limit).map((h: Record<string, unknown>) => ({
    hotelId: h.hotelId,
    hotelName: h.hotelName,
    location: h.location?.name || city,
    stars: h.stars,
    rating: h.rating,
    priceFrom: h.priceFrom,
    currency: currency.toUpperCase(),
    bookingUrl: buildHotelBookingUrl(String(h.hotelId), city, undefined, undefined),
    lgbtqFriendly: false,
  }));
}

function buildHotelBookingUrl(
  hotelId: string,
  city: string,
  checkIn?: string,
  checkOut?: string,
): string {
  const base = `https://www.hotellook.com/hotels/${encodeURIComponent(city.toLowerCase().replace(/\s+/g, '-'))}`;
  const params = new URLSearchParams();
  params.set('marker', MARKER);
  if (hotelId) params.set('hotelId', hotelId);
  if (checkIn) params.set('checkIn', checkIn);
  if (checkOut) params.set('checkOut', checkOut);
  return `${base}?${params.toString()}`;
}
