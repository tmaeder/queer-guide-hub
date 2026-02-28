import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from '../_shared/supabase-client.ts';

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
  origin: string, destination: string, departDate?: string | null, returnDate?: string | null, adults = 1
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
  params += String(Math.max(1, Math.min(9, adults)));
  return `https://www.aviasales.com/?params=${params}&marker=${MARKER}`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let origin: string, destination: string, departureDate: string,
        returnDate: string | undefined, passengers: number, cabinClass: string;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      origin = url.searchParams.get('origin') || '';
      destination = url.searchParams.get('destination') || '';
      departureDate = url.searchParams.get('departureDate') || '';
      returnDate = url.searchParams.get('returnDate') || undefined;
      passengers = parseInt(url.searchParams.get('passengers') || '1');
      cabinClass = url.searchParams.get('class') || 'economy';
    } else {
      const body = await req.json();
      origin = body.origin || '';
      destination = body.destination || '';
      departureDate = body.departureDate || '';
      returnDate = body.returnDate;
      passengers = body.passengers || 1;
      cabinClass = body.class || 'economy';
    }

    if (!origin || !destination) {
      return new Response(
        JSON.stringify({ error: 'origin and destination are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Searching flights:', { origin, destination, departureDate, returnDate, passengers });

    const apiToken = Deno.env.get('TRAVELPAYOUTS_API_TOKEN');
    if (!apiToken) {
      return new Response(
        JSON.stringify({ error: 'API token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchUrl = new URL('https://api.travelpayouts.com/aviasales/v3/prices_for_dates');
    searchUrl.searchParams.append('origin', origin);
    searchUrl.searchParams.append('destination', destination);
    if (departureDate) searchUrl.searchParams.append('departure_at', departureDate);
    if (returnDate) searchUrl.searchParams.append('return_at', returnDate);
    searchUrl.searchParams.append('unique', 'false');
    searchUrl.searchParams.append('sorting', 'price');
    searchUrl.searchParams.append('limit', '20');
    searchUrl.searchParams.append('token', apiToken);

    const response = await fetch(searchUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Travelpayouts API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to search flights' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    const flights = (data.data || []).map((flight: any) => ({
      id: `${flight.origin}-${flight.destination}-${flight.departure_at}`,
      origin: flight.origin,
      destination: flight.destination,
      departureDate: flight.departure_at,
      returnDate: flight.return_at,
      price: flight.price,
      currency: data.currency,
      airline: flight.airline,
      flightNumber: flight.flight_number,
      duration: flight.duration,
      stops: flight.transfers || 0,
      link: buildAffiliateUrl(flight.origin, flight.destination, flight.departure_at, flight.return_at, passengers),
    }));

    return new Response(
      JSON.stringify({
        success: true,
        flights,
        currency: data.currency || 'EUR',
        searchParams: { origin, destination, departureDate, returnDate, passengers }
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=1800',
        }
      }
    );

  } catch (error) {
    console.error('Search flights error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
