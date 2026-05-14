import { getCorsHeaders, corsResponse, errorResponse } from "../_shared/supabase-client.ts";

/**
 * Flight Calendar Pricing
 *
 * Returns cheapest flight price per day for a route.
 * Also returns monthly pricing for "best month to visit" widget.
 * Uses Travelpayouts calendar and monthly endpoints.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    const body = req.method === 'GET'
      ? Object.fromEntries(new URL(req.url).searchParams)
      : await req.json();

    const origin = (body.origin || '').toUpperCase().trim();
    const destination = (body.destination || '').toUpperCase().trim();
    const type = body.type || 'calendar'; // 'calendar' | 'monthly' | 'nearby'
    const currency = body.currency || 'eur';
    const month = body.month; // YYYY-MM for calendar

    const token = Deno.env.get('TRAVELPAYOUTS_API_TOKEN');
    if (!token) return errorResponse('Internal server error', 500, req);

    let data: unknown;

    switch (type) {
      case 'calendar':
        data = await fetchCalendar(origin, destination, month, currency, token);
        break;
      case 'monthly':
        data = await fetchMonthly(origin, destination, currency, token);
        break;
      case 'nearby':
        data = await fetchNearby(origin, destination, currency, token);
        break;
      default:
        return errorResponse('Invalid type', 400, req);
    }

    return new Response(JSON.stringify({ success: true, data, origin, destination, type }), {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('Flight calendar error:', error);
    return errorResponse('Internal server error', 500, req);
  }
});

async function fetchCalendar(
  origin: string, destination: string, month: string | undefined, currency: string, token: string,
): Promise<unknown> {
  const url = new URL('https://api.travelpayouts.com/v1/prices/calendar');
  url.searchParams.set('origin', origin);
  url.searchParams.set('destination', destination);
  url.searchParams.set('currency', currency);
  url.searchParams.set('token', token);
  if (month) url.searchParams.set('depart_date', `${month}-01`);

  const res = await fetch(url.toString());
  if (!res.ok) return { prices: [] };
  const data = await res.json();

  // Transform into array of { date, price, airline, transfers }
  const prices = Object.entries(data.data || {}).map(([date, info]: [string, unknown]) => ({
    date,
    price: (info as Record<string, unknown>).value,
    airline: (info as Record<string, unknown>).airline,
    transfers: (info as Record<string, unknown>).number_of_changes || 0,
    returnDate: (info as Record<string, unknown>).return_date,
  }));

  return { prices, currency: data.currency || currency };
}

async function fetchMonthly(
  origin: string, destination: string, currency: string, token: string,
): Promise<unknown> {
  const url = new URL('https://api.travelpayouts.com/v1/prices/monthly');
  url.searchParams.set('origin', origin);
  url.searchParams.set('destination', destination);
  url.searchParams.set('currency', currency);
  url.searchParams.set('token', token);

  const res = await fetch(url.toString());
  if (!res.ok) return { months: [] };
  const data = await res.json();

  // Transform into array of { month, price, airline }
  const months = Object.entries(data.data || {}).map(([date, info]: [string, unknown]) => {
    const d = new Date(date);
    return {
      month: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      date,
      price: (info as Record<string, unknown>).value,
      airline: (info as Record<string, unknown>).airline,
      transfers: (info as Record<string, unknown>).number_of_changes || 0,
    };
  });

  return { months, currency: data.currency || currency };
}

async function fetchNearby(
  origin: string, destination: string, currency: string, token: string,
): Promise<unknown> {
  const url = new URL('https://api.travelpayouts.com/v2/prices/nearest-places-matrix');
  url.searchParams.set('origin', origin);
  url.searchParams.set('destination', destination);
  url.searchParams.set('currency', currency);
  url.searchParams.set('token', token);
  url.searchParams.set('flexibility', '7');
  url.searchParams.set('distance', '100');
  url.searchParams.set('limit', '6');

  const res = await fetch(url.toString());
  if (!res.ok) return { alternatives: [] };
  const data = await res.json();

  const alternatives = (data.data?.prices || []).map((p: Record<string, unknown>) => ({
    origin: p.origin,
    destination: p.destination,
    price: p.value,
    departDate: p.depart_date,
    returnDate: p.return_date,
    airline: p.gate,
    transfers: p.number_of_changes || 0,
  }));

  return { alternatives, currency: data.currency || currency };
}
