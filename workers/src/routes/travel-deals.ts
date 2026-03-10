import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../lib/response';

const MARKER = '452012';
const IATA_RE = /^[A-Z]{3}$/;

function extractDDMM(dateStr?: string | null): string {
  if (!dateStr) return '';
  const iso = dateStr.split('T')[0];
  const parts = iso.split('-');
  if (parts.length !== 3) return '';
  const [, mm, dd] = parts;
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);
  if (isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${dd.padStart(2, '0')}${mm.padStart(2, '0')}`;
}

function buildAffiliateUrl(
  origin: string,
  destination: string,
  departDate?: string | null,
  returnDate?: string | null,
): string {
  const o = (origin || '').toUpperCase().trim();
  const d = (destination || '').toUpperCase().trim();
  if (!IATA_RE.test(o) || !IATA_RE.test(d) || o === d) {
    return `https://www.aviasales.com/?marker=${MARKER}`;
  }
  let params = o;
  const departDDMM = extractDDMM(departDate);
  if (departDDMM) params += departDDMM;
  params += d;
  const returnDDMM = extractDDMM(returnDate);
  if (returnDDMM) params += returnDDMM;
  params += '1';
  return `https://www.aviasales.com/?params=${params}&marker=${MARKER}`;
}

function formatDeal(flight: any, currency: string) {
  return {
    origin: flight.origin,
    destination: flight.destination,
    price: flight.price,
    currency,
    departure_date: flight.departure_at,
    return_date: flight.return_at,
    airline: flight.airline,
    flight_number: flight.flight_number,
    stops: flight.transfers || 0,
    duration: flight.duration,
    affiliate_url: buildAffiliateUrl(flight.origin, flight.destination, flight.departure_at, flight.return_at),
  };
}

async function fetchFlightDeals(
  token: string,
  origin: string,
  destination: string | undefined,
  currency: string,
  limit: number,
): Promise<any[]> {
  const url = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
  url.searchParams.set('origin', origin);
  if (destination) url.searchParams.set('destination', destination);
  url.searchParams.set('currency', currency);
  url.searchParams.set('sorting', 'price');
  url.searchParams.set('unique', 'false');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('token', token);

  const res = await fetch(url.toString());
  if (!res.ok) {
    return fetchCheapPrices(token, origin, destination, currency, limit);
  }
  const data = await res.json<{ data?: any[]; currency?: string }>();
  return (data.data || []).map((f: any) => formatDeal(f, data.currency || currency));
}

async function fetchCheapPrices(
  token: string,
  origin: string,
  destination: string | undefined,
  currency: string,
  limit: number,
): Promise<any[]> {
  const url = new URL('https://api.travelpayouts.com/v1/prices/cheap');
  url.searchParams.set('origin', origin);
  if (destination) url.searchParams.set('destination', destination);
  url.searchParams.set('currency', currency);
  url.searchParams.set('token', token);

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const data = await res.json<{ data?: Record<string, Record<string, any>>; currency?: string }>();
  if (!data.data) return [];

  const results: any[] = [];
  for (const [destCode, transfers] of Object.entries(data.data)) {
    for (const [, flight] of Object.entries(transfers)) {
      results.push({
        origin,
        destination: destCode,
        price: flight.price,
        currency: data.currency || currency,
        departure_date: flight.departure_at,
        return_date: flight.return_at,
        airline: flight.airline,
        stops: flight.number_of_changes || 0,
        expires_at: flight.expires_at,
        affiliate_url: buildAffiliateUrl(origin, destCode, flight.departure_at, flight.return_at),
      });
    }
  }
  return results.sort((a, b) => a.price - b.price).slice(0, limit);
}

async function fetchPopularRoutes(
  token: string,
  origin: string,
  currency: string,
  limit: number,
): Promise<any[]> {
  const url = new URL('https://api.travelpayouts.com/v1/city-directions-prices');
  url.searchParams.set('origin', origin);
  url.searchParams.set('currency', currency);
  url.searchParams.set('token', token);

  const res = await fetch(url.toString());
  if (!res.ok) return fetchFlightDeals(token, origin, undefined, currency, limit);
  const data = await res.json<{ data?: Record<string, any>; currency?: string }>();
  if (!data.data) return [];

  const results: any[] = [];
  for (const [destCode, flight] of Object.entries(data.data)) {
    results.push({
      origin: flight.origin || origin,
      destination: destCode,
      price: flight.price,
      currency: data.currency || currency,
      departure_date: flight.departure_at,
      return_date: flight.return_at,
      airline: flight.airline,
      stops: flight.transfers || 0,
      affiliate_url: buildAffiliateUrl(origin, destCode, flight.departure_at, flight.return_at),
    });
  }
  return results.sort((a, b) => a.price - b.price).slice(0, limit);
}

export async function handleTravelDeals(
  req: Request,
  env: Env,
): Promise<Response> {
  try {
    let origin: string, destination: string | undefined, type: string, currency: string, limit: number;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      origin = url.searchParams.get('origin') || '';
      destination = url.searchParams.get('destination') || undefined;
      type = url.searchParams.get('type') || 'flights';
      currency = url.searchParams.get('currency') || 'eur';
      limit = parseInt(url.searchParams.get('limit') || '10');
    } else {
      const body = await req.json<Record<string, any>>();
      origin = body.origin || '';
      destination = body.destination;
      type = body.type || 'flights';
      currency = body.currency || 'eur';
      limit = body.limit || 10;
    }

    if (!origin || !IATA_RE.test(origin.toUpperCase().trim())) {
      return errorResponse('Valid origin IATA code is required (e.g. "ZRH")', 400);
    }
    origin = origin.toUpperCase().trim();
    if (destination) destination = destination.toUpperCase().trim();

    if (!env.TRAVELPAYOUTS_API_TOKEN) {
      return errorResponse('Internal server error', 500);
    }

    let deals: any[];
    if (type === 'popular_routes') {
      deals = await fetchPopularRoutes(env.TRAVELPAYOUTS_API_TOKEN, origin, currency, limit);
    } else {
      deals = await fetchFlightDeals(env.TRAVELPAYOUTS_API_TOKEN, origin, destination, currency, limit);
    }

    return jsonResponse({ success: true, deals, origin, destination }, 200, {
      'Cache-Control': 'public, max-age=1800, s-maxage=1800',
    });
  } catch (err) {
    console.error('Travel deals error:', err);
    return errorResponse('Internal server error', 500);
  }
}
