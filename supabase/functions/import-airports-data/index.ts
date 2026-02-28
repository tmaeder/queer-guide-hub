import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, getServiceClient, requireAdmin, corsResponse, errorResponse, jsonResponse } from "../_shared/supabase-client.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse(req);

  try {
    const supabase = getServiceClient();
    const auth = await requireAdmin(req, supabase);
    if (auth instanceof Response) return auth;

    // Fetch airports and cities reference data from Travelpayouts
    const [airportsRes, citiesRes] = await Promise.all([
      fetch('https://api.travelpayouts.com/data/en/airports.json'),
      fetch('https://api.travelpayouts.com/data/en/cities.json'),
    ]);

    if (!airportsRes.ok || !citiesRes.ok) {
      return errorResponse('Failed to fetch Travelpayouts reference data', 502, req);
    }

    const airportsRaw = await airportsRes.json();
    const citiesRaw = await citiesRes.json();

    // Build city name lookup from cities data
    const cityNameMap = new Map<string, string>();
    for (const city of citiesRaw) {
      if (city.code && city.name) {
        cityNameMap.set(city.code, city.name);
      }
    }

    // Filter to real airports with IATA codes and coordinates
    const airports = airportsRaw
      .filter((a: any) =>
        a.code &&
        a.code.length === 3 &&
        a.name &&
        a.coordinates?.lat &&
        a.coordinates?.lon &&
        (!a.iata_type || a.iata_type === 'airport')
      )
      .map((a: any) => ({
        iata_code: a.code,
        name: a.name,
        city_name: cityNameMap.get(a.city_code) || a.city_code || null,
        city_iata: a.city_code || null,
        country_code: a.country_code || null,
        latitude: a.coordinates.lat,
        longitude: a.coordinates.lon,
        is_major: false,
      }));

    console.log(`Filtered ${airports.length} airports from ${airportsRaw.length} raw entries`);

    // Upsert in batches of 500
    const batchSize = 500;
    let inserted = 0;
    for (let i = 0; i < airports.length; i += batchSize) {
      const batch = airports.slice(i, i + batchSize);
      const { error } = await supabase
        .from('airports')
        .upsert(batch, { onConflict: 'iata_code' });

      if (error) {
        console.error(`Batch ${i / batchSize} error:`, error);
        return errorResponse('Internal server error', 500, req);
      }
      inserted += batch.length;
    }

    // Mark major airports (airports where city_iata matches the airport iata_code)
    // Fetch matching codes and update them via the PostgREST API
    const { data: majorAirports } = await supabase
      .from('airports')
      .select('iata_code, city_iata')

    if (majorAirports) {
      const majorCodes = majorAirports
        .filter(a => a.iata_code && a.city_iata && a.iata_code === a.city_iata)
        .map(a => a.iata_code)

      if (majorCodes.length > 0) {
        const { error: majorErr } = await supabase
          .from('airports')
          .update({ is_major: true })
          .in('iata_code', majorCodes)

        if (majorErr) {
          console.log('Could not mark major airports, skipping:', majorErr.message)
        } else {
          console.log(`Marked ${majorCodes.length} airports as major`)
        }
      }
    }

    return jsonResponse({
      success: true,
      total_raw: airportsRaw.length,
      total_imported: inserted,
      cities_referenced: cityNameMap.size,
    }, 200, req);

  } catch (error) {
    console.error('Import airports error:', error);
    return errorResponse('Internal server error', 500, req);
  }
});
