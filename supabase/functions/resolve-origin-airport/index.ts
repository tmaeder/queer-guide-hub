import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from "../_shared/supabase-client.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    let latitude: number, longitude: number;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      latitude = parseFloat(url.searchParams.get('latitude') || '');
      longitude = parseFloat(url.searchParams.get('longitude') || '');
    } else {
      const body = await req.json();
      latitude = body.latitude;
      longitude = body.longitude;
    }

    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      return errorResponse('latitude and longitude are required', 400);
    }

    const supabase = getServiceClient();

    // Find nearest airport using Haversine distance
    // The airports table is small (~3-6K rows), so a full scan with computed distance is fast
    const { data, error } = await supabase.rpc('find_nearest_airport', {
      visitor_lat: latitude,
      visitor_lng: longitude,
    });

    if (error) {
      console.error('DB error:', error);
      // Fallback: direct query with simple distance approximation
      const { data: fallback, error: fbErr } = await supabase
        .from('airports')
        .select('iata_code, city_name, country_code, latitude, longitude')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(1000);

      if (fbErr || !fallback?.length) {
        return errorResponse('Could not find nearest airport');
      }

      // Calculate distance manually
      const nearest = fallback.reduce((best: any, airport: any) => {
        const dist = haversine(latitude, longitude, airport.latitude, airport.longitude);
        if (!best || dist < best.dist) {
          return { ...airport, dist };
        }
        return best;
      }, null);

      return jsonResponse({
        iata: nearest.iata_code,
        city: nearest.city_name,
        country: nearest.country_code,
      });
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return jsonResponse({ iata: null, city: null, country: null });
    }

    const result = Array.isArray(data) ? data[0] : data;
    return jsonResponse({
      iata: result.iata_code,
      city: result.city_name,
      country: result.country_code,
    });

  } catch (error) {
    console.error('Resolve origin airport error:', error);
    return errorResponse('Internal server error');
  }
});

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
