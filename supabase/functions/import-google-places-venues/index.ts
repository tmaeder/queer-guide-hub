import { getCorsHeaders, requireAdmin, getServiceClient } from '../_shared/supabase-client.ts';
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts';
import { writeToStaging } from '../_shared/source-adapter.ts';

// ============================================================
// Admin-triggered Google Places fetcher.
// Fetch + parse only — venues are staged into ingestion_staging
// (source_type 'import-google-places') and flow through the
// standard validate → dedupe → review-gate → commit pipeline.
// No direct writes to venues/cities/venue_categories.
// ============================================================

interface GooglePlacesResult {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  types: string[];
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
  opening_hours?: {
    open_now: boolean;
    periods?: Array<{
      open: { day: number; time: string };
      close: { day: number; time: string };
    }>;
  };
  website?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
}

function mapGooglePlaceTypeToCategory(types: string[]) {
  // Map Google Places types to our venue categories
  const typeMapping: Record<string, { name: string; slug: string; category: string }> = {
    'night_club': { name: 'Entertainment & Nightlife', slug: 'entertainment-nightlife', category: 'club' },
    'bar': { name: 'Entertainment & Nightlife', slug: 'entertainment-nightlife', category: 'bar' },
    'restaurant': { name: 'Restaurants & Dining', slug: 'restaurants-dining', category: 'restaurant' },
    'cafe': { name: 'Restaurants & Dining', slug: 'restaurants-dining', category: 'restaurant' },
    'lodging': { name: 'Accommodation', slug: 'accommodation', category: 'hotel' },
    'spa': { name: 'Health & Wellness', slug: 'health-wellness', category: 'sauna' },
    'gym': { name: 'Health & Wellness', slug: 'health-wellness', category: 'other' },
    'shopping_mall': { name: 'Shopping', slug: 'shopping', category: 'other' },
    'store': { name: 'Shopping', slug: 'shopping', category: 'other' },
    'tourist_attraction': { name: 'Tourism & Culture', slug: 'tourism-culture', category: 'other' },
    'museum': { name: 'Tourism & Culture', slug: 'tourism-culture', category: 'theater' }
  };

  for (const type of types) {
    if (typeMapping[type]) {
      return typeMapping[type];
    }
  }

  // Default category
  return { name: 'Entertainment & Nightlife', slug: 'entertainment-nightlife', category: 'bar' };
}

async function searchGooglePlaces(apiKey: string, query: string, location: string) {
  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;

  console.log(`Geocoding location: ${location}`);
  const geocodeResponse = await fetch(geocodeUrl);

  if (!geocodeResponse.ok) {
    throw new Error(`Geocoding failed: ${geocodeResponse.status}`);
  }

  const geocodeData = await geocodeResponse.json();

  if (geocodeData.status !== 'OK' || !geocodeData.results?.length) {
    throw new Error(`No geocoding results for location: ${location}`);
  }

  const { lat, lng } = geocodeData.results[0].geometry.location;

  // Search for places using Text Search
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query + ' ' + location)}&location=${lat},${lng}&radius=10000&key=${apiKey}`;

  console.log(`Searching Google Places for: ${query} in ${location}`);
  const searchResponse = await fetch(searchUrl);

  if (!searchResponse.ok) {
    throw new Error(`Google Places search failed: ${searchResponse.status}`);
  }

  const searchData = await searchResponse.json();

  if (searchData.status !== 'OK') {
    throw new Error(`Google Places API error: ${searchData.status} - ${searchData.error_message || 'Unknown error'}`);
  }

  return {
    results: searchData.results || [],
    location: { lat, lng }
  };
}

async function getPlaceDetails(apiKey: string, placeId: string): Promise<GooglePlacesResult | null> {
  const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=place_id,name,formatted_address,geometry,rating,user_ratings_total,price_level,types,photos,opening_hours,website,formatted_phone_number,international_phone_number&key=${apiKey}`;

  const response = await fetch(detailsUrl);

  if (!response.ok) {
    console.error(`Failed to get place details for ${placeId}: ${response.status}`);
    return null;
  }

  const data = await response.json();

  if (data.status !== 'OK') {
    console.error(`Google Places details error for ${placeId}: ${data.status}`);
    return null;
  }

  return data.result;
}

// Staging adapter: normalizes a fetched place into the standard
// NormalizedItem shape the venue pipeline (validate/dedupe/commit) expects.
const googlePlacesImportAdapter: SourceAdapter = {
  name: 'google-places',
  entityType: 'venue',

  // fetch is driven inline by the handler (query × location loops).
  fetch(_config: AdapterConfig): Promise<RawItem[]> {
    return Promise.resolve([]);
  },

  normalize(raw: RawItem): NormalizedItem {
    const d = raw.data as unknown as GooglePlacesResult & {
      _search_query?: string;
      _search_location?: string;
    };
    const categoryMapping = mapGooglePlaceTypeToCategory(d.types || []);

    // Extract city from address (same heuristic as the legacy importer)
    const addressParts = (d.formatted_address || '').split(',');
    const cityName = addressParts[addressParts.length - 3]?.trim()
      || String(d._search_location || '').split(',')[0].trim();
    const stateName = addressParts[addressParts.length - 2]?.trim() || '';

    // Query-derived LGBTQ+ tags
    const query = String(d._search_query || '');
    const tags = ['lgbt-friendly', 'google-places'];
    if (query.includes('gay')) tags.push('gay-friendly');
    if (query.includes('lesbian')) tags.push('lesbian-friendly');
    if (query.includes('queer')) tags.push('queer-friendly');
    if (query.includes('pride')) tags.push('pride-friendly');

    // Opening hours
    let hours: Record<string, { open: string; close: string }> | null = null;
    if (d.opening_hours?.periods) {
      hours = {};
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      for (const period of d.opening_hours.periods) {
        const dayName = dayNames[period.open.day];
        if (dayName && period.close) {
          hours[dayName] = { open: period.open.time, close: period.close.time };
        }
      }
    }

    return {
      entityType: 'venue',
      sourceId: raw.sourceId,
      sourceName: 'google-places',
      name: String(d.name || '').slice(0, 200),
      description: '',
      category: categoryMapping.category,
      location: {
        lat: d.geometry?.location?.lat,
        lng: d.geometry?.location?.lng,
        address: d.formatted_address || '',
        city: cityName,
        country: 'US', // Most Google Places results are US-based for our queries
      },
      urls: d.website ? [String(d.website)] : [],
      tags,
      contacts: {
        phone: d.formatted_phone_number || d.international_phone_number || undefined,
        website: d.website || undefined,
      },
      metadata: {
        google_place_id: d.place_id,
        google_rating: d.rating ?? null,
        google_review_count: d.user_ratings_total ?? null,
        price_range: d.price_level ?? null,
        hours,
        state: stateName,
        types: d.types,
        search_query: d._search_query ?? null,
        search_location: d._search_location ?? null,
        platform_ids: { google: d.place_id },
        data_source: 'google_places',
      },
    } as NormalizedItem;
  },

  getSourceId(raw: RawItem): string {
    return raw.sourceId;
  },
};

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = getServiceClient();
  const auth = await requireAdmin(req, supabase);
  if (auth instanceof Response) return auth;

  try {
    console.log('Starting Google Places venues fetch...');

    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')!;

    console.log('Google Places API Key configured:', googleApiKey ? 'Yes' : 'No');

    if (!googleApiKey) {
      throw new Error('Google Places API key not configured');
    }

    // Test API key validity first
    console.log('Testing Google Places API key...');
    const testUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=restaurant&location=40.7128,-74.0060&radius=1000&key=${googleApiKey}`;

    const testResponse = await fetch(testUrl);
    const testData = await testResponse.json();

    if (!testResponse.ok || testData.status !== 'OK') {
      console.error('API key test failed:', testData);
      let errorMessage = `Google Places API key invalid - ${testData.error_message || 'Unknown error'}`;

      // Provide specific guidance for common errors
      if (testData.status === 'REQUEST_DENIED') {
        errorMessage += '. Please ensure the API key has Google Places API enabled and billing is activated in Google Cloud Console.';
      } else if (testData.status === 'OVER_QUERY_LIMIT') {
        errorMessage += '. The API quota has been exceeded. Please check your billing and quota limits.';
      }

      throw new Error(errorMessage);
    }

    console.log('Google Places API key test successful');

    // LGBTQ+ friendly search queries
    const queries = [
      'LGBTQ friendly bar',
      'gay bar',
      'lesbian bar',
      'queer friendly restaurant',
      'pride friendly cafe',
      'LGBTQ community center'
    ];

    const locations = ['New York, NY', 'San Francisco, CA', 'Los Angeles, CA', 'Chicago, IL'];

    const rawItems: RawItem[] = [];
    const seen = new Set<string>();

    for (const query of queries) {
      for (const location of locations) {
        console.log(`Searching for "${query}" in ${location}...`);

        try {
          const searchResults = await searchGooglePlaces(googleApiKey, query, location);

          console.log(`Found ${searchResults.results.length} results for "${query}" in ${location}`);

          // Process each place (limit to 5 per search to avoid rate limits)
          for (const place of searchResults.results.slice(0, 5)) {
            try {
              if (seen.has(place.place_id)) continue;
              seen.add(place.place_id);

              // Get detailed information
              const placeDetails = await getPlaceDetails(googleApiKey, place.place_id);

              if (!placeDetails) {
                console.log(`Skipping place ${place.place_id} - no details available`);
                continue;
              }

              rawItems.push({
                sourceId: placeDetails.place_id,
                data: {
                  ...(placeDetails as unknown as Record<string, unknown>),
                  _search_query: query,
                  _search_location: location,
                },
              });
            } catch (venueError) {
              console.error(`Error processing venue ${place.place_id}:`, venueError);
            }

            // Add delay between requests to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (searchError) {
          console.error(`Error searching for "${query}" in ${location}:`, searchError);
        }

        // Add delay between searches
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Stage everything for the review pipeline (idempotent per source id).
    const staged = await writeToStaging(supabase, googlePlacesImportAdapter, rawItems, {
      batchSize: rawItems.length,
      targetTable: 'venues',
      sourceType: 'import-google-places',
    });

    console.log(`Google Places fetch completed. Staged ${staged} of ${rawItems.length} venues.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Staged ${staged} venues for the review pipeline`,
        staged,
        total_processed: rawItems.length
      }),
      {
        headers: { ...cors, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Google Places fetch error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error'
      }),
      {
        headers: { ...cors, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
