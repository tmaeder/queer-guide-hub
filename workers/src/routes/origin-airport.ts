/**
 * resolve-origin-airport — Find nearest commercial airport via Supabase RPC.
 * Light DB usage: single RPC call with fallback to a table scan.
 */
import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../cors';
import { supabaseRpc, supabaseRest } from '../supabase-rest';

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
    return errorResponse('latitude and longitude are required', 400, req, env);
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
        req,
        env,
      );
    }
  }

  // Fallback: fetch airports and compute distance manually
  const { data: airports, error: fetchError } = await supabaseRest<Airport[]>(
    env,
    '/rest/v1/airports?select=iata_code,city_name,country_code,latitude,longitude&latitude=not.is.null&longitude=not.is.null&limit=1000',
  );

  if (fetchError || !airports?.length) {
    return errorResponse('Could not find nearest airport', 500, req, env);
  }

  let best: (Airport & { dist: number }) | null = null;
  for (const airport of airports) {
    const dist = haversine(latitude, longitude, airport.latitude, airport.longitude);
    if (!best || dist < best.dist) {
      best = { ...airport, dist };
    }
  }

  return jsonResponse(
    { iata: best!.iata_code, city: best!.city_name, country: best!.country_code },
    200,
    req,
    env,
  );
}
