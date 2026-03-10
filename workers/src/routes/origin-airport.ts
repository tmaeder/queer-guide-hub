/**
 * resolve-origin-airport — Find nearest commercial airport via Supabase RPC.
 * Light DB usage: single RPC call with fallback to a table scan.
 */
import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../lib/response';
import { supabaseRpc, supabaseRest } from '../supabase-rest';
import { haversineKm } from '../lib/geo';

interface Airport {
  iata_code: string;
  city_name: string;
  country_code: string;
  latitude: number;
  longitude: number;
}

export async function handleOriginAirport(req: Request, env: Env): Promise<Response> {
  let latitude: number;
  let longitude: number;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    latitude = parseFloat(url.searchParams.get('latitude') || '');
    longitude = parseFloat(url.searchParams.get('longitude') || '');
  } else {
    const body = await req.json<any>();
    latitude = body.latitude;
    longitude = body.longitude;
  }

  if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) {
    return errorResponse('latitude and longitude are required', 400);
  }

  // Try RPC first
  const { data: rpcData, error: rpcError } = await supabaseRpc<Airport | Airport[]>(
    env,
    'find_nearest_airport',
    { visitor_lat: latitude, visitor_lng: longitude },
  );

  if (!rpcError && rpcData) {
    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (result) {
      return jsonResponse(
        { iata: result.iata_code, city: result.city_name, country: result.country_code },
        200,
      );
    }
  }

  // Fallback: fetch airports and compute distance manually
  const { data: airports, error: fetchError } = await supabaseRest<Airport[]>(
    env,
    '/rest/v1/airports?select=iata_code,city_name,country_code,latitude,longitude&latitude=not.is.null&longitude=not.is.null&limit=1000',
  );

  if (fetchError || !airports?.length) {
    return errorResponse('Could not find nearest airport', 500);
  }

  let best: (Airport & { dist: number }) | null = null;
  for (const airport of airports) {
    const dist = haversineKm(latitude, longitude, airport.latitude, airport.longitude);
    if (!best || dist < best.dist) {
      best = { ...airport, dist };
    }
  }

  return jsonResponse(
    { iata: best!.iata_code, city: best!.city_name, country: best!.country_code },
    200,
  );
}
