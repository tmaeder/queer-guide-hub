import { getCorsHeaders, corsResponse, errorResponse } from "../_shared/supabase-client.ts";

/**
 * Activity Search via GetYourGuide Partner API
 *
 * Searches for tours, activities, and experiences by city.
 * Uses the GYG widget/affiliate API for search results.
 * Partner ID: 2PBDXWH
 */

const PARTNER_ID = '2PBDXWH';
const _GYG_API_BASE = 'https://api.getyourguide.com/1';
const _GYG_WIDGET_BASE = 'https://widget-api.getyourguide.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    let city: string, category: string | undefined;
    let date: string | undefined, limit: number, currency: string;
    let latitude: number | undefined, longitude: number | undefined;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      city = url.searchParams.get('city') || '';
      category = url.searchParams.get('category') || undefined;
      date = url.searchParams.get('date') || undefined;
      limit = parseInt(url.searchParams.get('limit') || '12');
      currency = url.searchParams.get('currency') || 'eur';
      latitude = url.searchParams.get('lat') ? parseFloat(url.searchParams.get('lat')!) : undefined;
      longitude = url.searchParams.get('lng') ? parseFloat(url.searchParams.get('lng')!) : undefined;
    } else {
      const body = await req.json();
      city = body.city || '';
      category = body.category;
      date = body.date;
      limit = body.limit || 12;
      currency = body.currency || 'eur';
      latitude = body.latitude;
      longitude = body.longitude;
    }

    if (!city && !latitude) {
      return errorResponse('City name or coordinates required', 400, req);
    }

    const activities = await searchActivities(city, category, date, limit, currency, latitude, longitude);

    return new Response(JSON.stringify({ success: true, activities, city }), {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('Activity search error:', error);
    return errorResponse('Internal server error', 500, req);
  }
});

async function searchActivities(
  city: string,
  category: string | undefined,
  date: string | undefined,
  limit: number,
  currency: string,
  latitude: number | undefined,
  longitude: number | undefined,
): Promise<unknown[]> {
  // Try the GYG widget API first (no auth required, uses partner ID)
  const params = new URLSearchParams();
  params.set('partner_id', PARTNER_ID);
  params.set('currency', currency.toUpperCase());
  params.set('limit', String(limit));
  params.set('sortBy', 'popularity');

  if (city) params.set('q', city);
  if (latitude && longitude) {
    params.set('coordinates', `${latitude},${longitude}`);
    params.set('radius', '30'); // 30km radius
  }
  if (category) params.set('category', category);
  if (date) params.set('date', date);

  // Use the tours search endpoint
  const url = `https://travelers-api.getyourguide.com/activities?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Access-Token': PARTNER_ID,
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data.data?.activities || data.activities) {
        const items = data.data?.activities || data.activities || [];
        return items.slice(0, limit).map(formatActivity);
      }
    }
  } catch (e) {
    console.warn('GYG travelers API failed:', e);
  }

  // Fallback: build affiliate search URLs and return curated results
  return buildFallbackResults(city, category, limit, currency);
}

function formatActivity(activity: Record<string, unknown>): Record<string, unknown> {
  const pictures = activity.pictures as Record<string, unknown>[] | undefined;
  const price = activity.price as Record<string, unknown> | undefined;
  const rating = activity.overallRating as Record<string, unknown> | undefined;

  return {
    activityId: activity.id || activity.activityId,
    title: activity.title,
    abstract: activity.abstract || activity.shortDescription,
    imageUrl: pictures?.[0]?.url || pictures?.[0]?.small,
    price: price?.amount || price?.value || activity.priceFrom,
    originalPrice: price?.originalAmount,
    currency: (price?.currency as string) || 'EUR',
    rating: rating?.average || rating?.overallRating || activity.rating,
    reviewCount: rating?.total || rating?.numberOfRatings || activity.numberOfRatings,
    duration: activity.duration || activity.durationText,
    category: activity.primaryCategory?.name || activity.category,
    bookingUrl: buildAffiliateUrl(activity.id as string || activity.activityId as string),
    isFreeCancellation: activity.isFreeCancellation ?? false,
    isBestseller: activity.isBestseller ?? false,
  };
}

function buildAffiliateUrl(activityId: string): string {
  if (!activityId) return `https://www.getyourguide.com/?partner_id=${PARTNER_ID}`;
  return `https://www.getyourguide.com/activity/${activityId}/?partner_id=${PARTNER_ID}`;
}

function buildFallbackResults(
  city: string,
  category: string | undefined,
  limit: number,
  currency: string,
): unknown[] {
  // Return a single "search" card that links to GYG search
  const searchUrl = `https://www.getyourguide.com/s/?q=${encodeURIComponent(city)}${category ? `&category=${category}` : ''}&partner_id=${PARTNER_ID}`;

  return [{
    activityId: `search-${city}`,
    title: `Browse activities in ${city}`,
    abstract: `Discover tours, experiences, and things to do in ${city} on GetYourGuide`,
    imageUrl: null,
    price: null,
    currency: currency.toUpperCase(),
    rating: null,
    reviewCount: null,
    duration: null,
    category: category || 'all',
    bookingUrl: searchUrl,
    isFreeCancellation: false,
    isBestseller: false,
  }];
}
