import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { enrichVenueWithAI } from '../_shared/ai-enrichment.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Helper functions for data management
async function getOrCreateCity(supabase: any, cityName: string, countryCode: string, lat: number, lng: number) {
  const { data: existingCity } = await supabase
    .from('cities')
    .select('id')
    .eq('name', cityName)
    .maybeSingle();

  if (existingCity) {
    return existingCity.id;
  }

  const { data: country } = await supabase
    .from('countries')
    .select('id')
    .eq('code', countryCode)
    .maybeSingle();

  const { data: newCity, error } = await supabase
    .from('cities')
    .insert({
      name: cityName,
      country_id: country?.id || null,
      latitude: lat,
      longitude: lng,
      is_major_city: false
    })
    .select('id')
    .maybeSingle();

  if (!error && newCity) {
    console.log(`Created new city: ${cityName}`);
    return newCity.id;
  }

  return null;
}

async function getOrCreateVenueCategory(supabase: any, categoryName: string, categorySlug: string) {
  const { data: existing } = await supabase
    .from('venue_categories')
    .select('id')
    .eq('slug', categorySlug)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  const { data: newCategory, error } = await supabase
    .from('venue_categories')
    .insert({
      name: categoryName,
      slug: categorySlug,
      description: `Auto-created from Google Places import`,
      icon: categorySlug.includes('entertainment') ? 'Music' : 
            categorySlug.includes('restaurant') ? 'UtensilsCrossed' : 
            categorySlug.includes('lodging') ? 'Bed' : 'MapPin',
      color: categorySlug.includes('entertainment') ? '#8b5cf6' : 
             categorySlug.includes('restaurant') ? '#ef4444' : 
             categorySlug.includes('lodging') ? '#f59e0b' : '#6366f1'
    })
    .select('id')
    .maybeSingle();

  if (!error && newCategory) {
    console.log(`Created new venue category: ${categoryName}`);
    return newCategory.id;
  }

  return null;
}

function mapGooglePlaceTypeToCategory(types: string[]) {
  // Map Google Places types to our venue categories
  const typeMapping = {
    'night_club': { name: 'Entertainment & Nightlife', slug: 'entertainment-nightlife', category: 'bar' },
    'bar': { name: 'Entertainment & Nightlife', slug: 'entertainment-nightlife', category: 'bar' },
    'restaurant': { name: 'Restaurants & Dining', slug: 'restaurants-dining', category: 'restaurant' },
    'cafe': { name: 'Restaurants & Dining', slug: 'restaurants-dining', category: 'cafe' },
    'lodging': { name: 'Accommodation', slug: 'accommodation', category: 'hotel' },
    'spa': { name: 'Health & Wellness', slug: 'health-wellness', category: 'spa' },
    'gym': { name: 'Health & Wellness', slug: 'health-wellness', category: 'gym' },
    'shopping_mall': { name: 'Shopping', slug: 'shopping', category: 'shopping' },
    'store': { name: 'Shopping', slug: 'shopping', category: 'shopping' },
    'tourist_attraction': { name: 'Tourism & Culture', slug: 'tourism-culture', category: 'attraction' },
    'museum': { name: 'Tourism & Culture', slug: 'tourism-culture', category: 'museum' }
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting Google Places venues import...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const googleApiKey = Deno.env.get('GOOGLE_PLACES_API_KEY')!;
    
    console.log('Google Places API Key configured:', googleApiKey ? 'Yes' : 'No');
    console.log('API Key length:', googleApiKey?.length || 0);
    
    if (!googleApiKey) {
      throw new Error('Google Places API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

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
    
    let totalImported = 0;
    let totalSkipped = 0;

    for (const query of queries) {
      for (const location of locations) {
        console.log(`Searching for "${query}" in ${location}...`);
        
        try {
          const searchResults = await searchGooglePlaces(googleApiKey, query, location);
          
          console.log(`Found ${searchResults.results.length} results for "${query}" in ${location}`);

          // Process each place (limit to 5 per search to avoid rate limits)
          for (const place of searchResults.results.slice(0, 5)) {
            try {
              // Get detailed information
              const placeDetails = await getPlaceDetails(googleApiKey, place.place_id);
              
              if (!placeDetails) {
                console.log(`Skipping place ${place.place_id} - no details available`);
                continue;
              }
              
              // Check if venue already exists
              const { data: existingVenue } = await supabase
                .from('venues')
                .select('id')
                .or(`google_place_id.eq.${placeDetails.place_id},and(data_source.eq.google_places,external_id.eq.${placeDetails.place_id})`)
                .maybeSingle();

              if (existingVenue) {
                console.log(`Venue ${placeDetails.name} already exists, skipping...`);
                totalSkipped++;
                continue;
              }

              // Extract city from address
              const addressParts = placeDetails.formatted_address.split(',');
              const cityName = addressParts[addressParts.length - 3]?.trim() || location.split(',')[0];
              const stateName = addressParts[addressParts.length - 2]?.trim();
              const countryCode = 'US'; // Most Google Places results will be US-based for our queries

              // Get or create city
              const cityId = await getOrCreateCity(
                supabase, 
                cityName, 
                countryCode, 
                placeDetails.geometry.location.lat, 
                placeDetails.geometry.location.lng
              );

              // Map category
              const categoryMapping = mapGooglePlaceTypeToCategory(placeDetails.types);
              const categoryId = await getOrCreateVenueCategory(supabase, categoryMapping.name, categoryMapping.slug);

              // Prepare tags
              const tags = ['lgbt-friendly', 'google-places'];
              if (query.includes('gay')) tags.push('gay-friendly');
              if (query.includes('lesbian')) tags.push('lesbian-friendly');
              if (query.includes('queer')) tags.push('queer-friendly');
              if (query.includes('pride')) tags.push('pride-friendly');

              // Prepare hours data
              let hours = null;
              if (placeDetails.opening_hours?.periods) {
                hours = {};
                const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                placeDetails.opening_hours.periods.forEach(period => {
                  const dayName = dayNames[period.open.day];
                  if (dayName && period.close) {
                    hours[dayName] = {
                      open: period.open.time,
                      close: period.close.time
                    };
                  }
                });
              }

              // Prepare venue data
              const venueData = {
                name: placeDetails.name,
                description: `${categoryMapping.category} found via Google Places import for "${query}"`,
                address: placeDetails.formatted_address,
                city: cityName,
                state: stateName || '',
                country: countryCode,
                postal_code: '', // Google doesn't always provide postal code separately
                latitude: placeDetails.geometry.location.lat,
                longitude: placeDetails.geometry.location.lng,
                phone: placeDetails.formatted_phone_number || placeDetails.international_phone_number || null,
                website: placeDetails.website || null,
                email: null, // Google Places doesn't provide email
                category: categoryMapping.category,
                tags: tags,
                amenities: [], // We'll add basic amenities based on types
                services: [], // We'll add basic services based on types
                price_range: placeDetails.price_level || null,
                hours: hours,
                images: [], // We can fetch photos separately if needed
                verified: false,
                featured: false,
                google_place_id: placeDetails.place_id,
                google_rating: placeDetails.rating || null,
                google_review_count: placeDetails.user_ratings_total || null,
                data_source: 'google_places',
                external_id: placeDetails.place_id,
                last_synced_at: new Date().toISOString(),
                sync_status: 'synced',
                created_by: null // System import
              };

              // AI enrichment — enhance description and tags if available
              try {
                const aiEnrichment = await enrichVenueWithAI(supabase, venueData)
                if (aiEnrichment) {
                  if (aiEnrichment.description && !venueData.description) venueData.description = aiEnrichment.description as string
                  if (aiEnrichment.tags) venueData.tags = [...new Set([...(venueData.tags || []), ...(aiEnrichment.tags as string[])])]
                }
              } catch (e) { console.warn('AI enrichment skipped:', e) }

              // Insert venue
              const { data: insertedVenue, error: insertError } = await supabase
                .from('venues')
                .insert(venueData)
                .select()
                .single();

              if (insertError) {
                console.error('Error inserting venue:', insertError);
                continue;
              }

              console.log(`Successfully imported venue: ${placeDetails.name}`);
              totalImported++;

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

    console.log(`Google Places import completed. Imported: ${totalImported}, Skipped: ${totalSkipped}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Google Places import completed successfully. Imported ${totalImported} venues, skipped ${totalSkipped} duplicates.`,
        imported: totalImported,
        skipped: totalSkipped
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Google Places import error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    let errorMessage = 'Unknown error occurred';
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Check for specific API errors
      if (errorMessage.includes('API key invalid') || errorMessage.includes('REQUEST_DENIED')) {
        statusCode = 401;
        errorMessage = 'Google Places API key is invalid or unauthorized. Please check your API key.';
      } else if (errorMessage.includes('OVER_QUERY_LIMIT')) {
        statusCode = 429;
        errorMessage = 'Google Places API quota exceeded. Please try again later.';
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        details: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : String(error)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode
      }
    );
  }
});