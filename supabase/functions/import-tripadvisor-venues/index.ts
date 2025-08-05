import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TripAdvisorLocation {
  location_id: string;
  name: string;
  description?: string;
  address_obj?: {
    address_string: string;
    street1?: string;
    city?: string;
    state?: string;
    country?: string;
    postalcode?: string;
  };
  latitude: string;
  longitude: string;
  phone?: string;
  website?: string;
  email?: string;
  category?: {
    name: string;
  };
  subcategory?: Array<{
    name: string;
  }>;
  rating?: string;
  rating_image_url?: string;
  num_reviews?: string;
  price_level?: string;
  hours?: {
    periods?: Array<{
      open: { day: number; time: string };
      close: { day: number; time: string };
    }>;
  };
  photo?: {
    images?: {
      large?: { url: string };
      medium?: { url: string };
      small?: { url: string };
    };
  };
  photos?: Array<{
    images?: {
      large?: { url: string };
      medium?: { url: string };
      small?: { url: string };
    };
  }>;
}

// Helper functions for data management
async function getOrCreateCity(supabase: any, cityName: string, countryCode: string, lat: number, lon: number) {
  const { data: existingCity } = await supabase
    .from('cities')
    .select('id')
    .eq('name', cityName)
    .maybeSingle()

  if (existingCity) {
    return existingCity.id
  }

  const { data: country } = await supabase
    .from('countries')
    .select('id')
    .eq('code', countryCode)
    .maybeSingle()

  const { data: newCity, error } = await supabase
    .from('cities')
    .insert({
      name: cityName,
      country_id: country?.id || null,
      latitude: lat,
      longitude: lon,
      is_major_city: false
    })
    .select('id')
    .maybeSingle()

  if (!error && newCity) {
    console.log(`Created new city: ${cityName}`)
    return newCity.id
  }

  return null
}

async function getOrCreateVenueCategory(supabase: any, categoryName: string, categorySlug: string) {
  const { data: existing } = await supabase
    .from('venue_categories')
    .select('id')
    .eq('slug', categorySlug)
    .maybeSingle()

  if (existing) {
    return existing.id
  }

  // Create new category
  const { data: newCategory, error } = await supabase
    .from('venue_categories')
    .insert({
      name: categoryName,
      slug: categorySlug,
      description: `Auto-created from TripAdvisor import`,
      icon: categorySlug.includes('entertainment') ? 'Music' : 
            categorySlug.includes('restaurant') ? 'UtensilsCrossed' : 
            categorySlug.includes('hotel') ? 'Bed' : 'MapPin',
      color: categorySlug.includes('entertainment') ? '#8b5cf6' : 
             categorySlug.includes('restaurant') ? '#ef4444' : 
             categorySlug.includes('hotel') ? '#f59e0b' : '#6366f1'
    })
    .select('id')
    .maybeSingle()

  if (!error && newCategory) {
    console.log(`Created new venue category: ${categoryName}`)
    return newCategory.id
  }

  return null
}

async function getOrCreateAmenity(supabase: any, amenityName: string, amenitySlug: string) {
  const { data: existing } = await supabase
    .from('venue_amenities')
    .select('id')
    .eq('slug', amenitySlug)
    .maybeSingle()

  if (existing) {
    return existing.id
  }

  const { data: newAmenity, error } = await supabase
    .from('venue_amenities')
    .insert({
      name: amenityName,
      slug: amenitySlug,
      description: `Auto-created from TripAdvisor import`,
      icon: amenitySlug.includes('wifi') ? 'Wifi' : 
            amenitySlug.includes('parking') ? 'Car' : 
            amenitySlug.includes('phone') ? 'Phone' : 'MapPin'
    })
    .select('id')
    .maybeSingle()

  if (!error && newAmenity) {
    console.log(`Created new amenity: ${amenityName}`)
    return newAmenity.id
  }

  return null
}

async function getOrCreateService(supabase: any, serviceName: string, serviceSlug: string) {
  const { data: existing } = await supabase
    .from('venue_services')
    .select('id')
    .eq('slug', serviceSlug)
    .maybeSingle()

  if (existing) {
    return existing.id
  }

  const { data: newService, error } = await supabase
    .from('venue_services')
    .insert({
      name: serviceName,
      slug: serviceSlug,
      description: `Auto-created from TripAdvisor import`,
      icon: serviceSlug.includes('dining') ? 'UtensilsCrossed' : 
            serviceSlug.includes('beverage') ? 'Wine' : 
            serviceSlug.includes('accommodation') ? 'Bed' : 
            serviceSlug.includes('wellness') ? 'Heart' : 'MapPin'
    })
    .select('id')
    .maybeSingle()

  if (!error && newService) {
    console.log(`Created new service: ${serviceName}`)
    return newService.id
  }

  return null
}

async function mapVenueCategoryAndAmenities(supabase: any, venue: TripAdvisorLocation, keyword: string) {
  let categoryName = 'Entertainment & Nightlife'
  let categorySlug = 'entertainment-nightlife'
  let category = 'bar'
  
  const amenityNames = []
  const serviceNames = []
  const amenityIds = []
  const serviceIds = []

  // Determine category based on keyword and venue data
  if (keyword.includes('sauna')) {
    categoryName = 'Health & Wellness'
    categorySlug = 'health-wellness'
    category = 'sauna'
    serviceNames.push('Wellness Services', 'Relaxation')
  } else if (venue.category?.name?.toLowerCase().includes('restaurant')) {
    categoryName = 'Restaurants & Dining'
    categorySlug = 'restaurants-dining'
    category = 'restaurant'
    serviceNames.push('Dine-In', 'Food Service')
  } else if (venue.category?.name?.toLowerCase().includes('hotel')) {
    categoryName = 'Accommodation'
    categorySlug = 'accommodation'
    category = 'hotel'
    serviceNames.push('Accommodation', 'Lodging')
  } else {
    categoryName = 'Entertainment & Nightlife'
    categorySlug = 'entertainment-nightlife'
    category = 'bar'
    serviceNames.push('Beverages', 'Entertainment')
  }

  // Get or create category
  const categoryId = await getOrCreateVenueCategory(supabase, categoryName, categorySlug)

  // Basic amenities
  if (venue.phone) {
    amenityNames.push('Phone Service')
    const amenityId = await getOrCreateAmenity(supabase, 'Phone Service', 'phone-service')
    if (amenityId) amenityIds.push(amenityId)
  }

  if (venue.website) {
    amenityNames.push('WiFi')
    const amenityId = await getOrCreateAmenity(supabase, 'WiFi', 'wifi')
    if (amenityId) amenityIds.push(amenityId)
  }

  // Create services
  for (const serviceName of serviceNames) {
    const serviceSlug = serviceName.toLowerCase().replace(/\s+/g, '-')
    const serviceId = await getOrCreateService(supabase, serviceName, serviceSlug)
    if (serviceId) serviceIds.push(serviceId)
  }

  return {
    category,
    categoryId,
    amenityNames,
    serviceNames,
    amenityIds,
    serviceIds
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting TripAdvisor venues import...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const tripadvisorApiKey = Deno.env.get('TRIPADVISOR_API_KEY')!;
    
    console.log('TripAdvisor API Key configured:', tripadvisorApiKey ? 'Yes' : 'No');
    console.log('API Key length:', tripadvisorApiKey?.length || 0);
    
    if (!tripadvisorApiKey) {
      throw new Error('TripAdvisor API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Test API key validity first
    console.log('Testing TripAdvisor API key validity...');
    const testUrl = `https://api.content.tripadvisor.com/api/v1/location/search?key=${tripadvisorApiKey}&searchQuery=New%20York&language=en`;
    
    console.log('Making test request to verify API key...');
    const testResponse = await fetch(testUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Queer-Guide-Import/1.0'
      },
    });

    console.log('Test response status:', testResponse.status);
    console.log('Test response headers:', Object.fromEntries(testResponse.headers.entries()));

    if (!testResponse.ok) {
      console.error('API key test failed:', testResponse.status, testResponse.statusText);
      const errorText = await testResponse.text();
      console.error('Error response body:', errorText);
      
      // Check for specific error types
      if (testResponse.status === 401) {
        throw new Error('TripAdvisor API key is invalid or unauthorized. Please verify your API key.');
      } else if (testResponse.status === 403) {
        throw new Error('TripAdvisor API access forbidden. Your API key may not have the required permissions.');
      } else if (testResponse.status === 429) {
        throw new Error('TripAdvisor API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`TripAdvisor API test failed with status ${testResponse.status}: ${errorText}`);
      }
    }

    const testData = await testResponse.json();
    console.log('API key test successful. Sample response:', JSON.stringify(testData, null, 2));

    // Reduced dataset for testing
    const keywords = ['gay bar'];
    const locations = ['New York'];
    
    let totalImported = 0;
    let totalSkipped = 0;

    for (const keyword of keywords) {
      for (const location of locations) {
        console.log(`Searching for "${keyword}" in ${location}...`);
        
        try {
          // Updated API endpoint with query parameter authentication
          const searchUrl = `https://api.content.tripadvisor.com/api/v1/location/search?key=${tripadvisorApiKey}&searchQuery=${encodeURIComponent(keyword + ' ' + location)}&language=en`;
          
          console.log('Search URL (without key):', searchUrl.replace(/key=[^&]+/, 'key=***'));
          
          const searchResponse = await fetch(searchUrl, {
            headers: {
              'Accept': 'application/json',
            },
          });

          if (!searchResponse.ok) {
            console.error(`TripAdvisor search failed for "${keyword}" in ${location}:`, searchResponse.status, searchResponse.statusText);
            const errorText = await searchResponse.text();
            console.error('Search error response:', errorText);
            continue;
          }

          const searchData = await searchResponse.json();
          console.log(`Found ${searchData.data?.length || 0} results for "${keyword}" in ${location}`);

          if (!searchData.data || !Array.isArray(searchData.data)) {
            continue;
          }

          // Process each location
          for (const item of searchData.data.slice(0, 5)) { // Limit to 5 per search to avoid rate limits
            try {
              // Get detailed information for each location
              const detailsUrl = `https://api.content.tripadvisor.com/api/v1/location/${item.location_id}/details?key=${tripadvisorApiKey}&language=en&currency=USD`;
              
              console.log('Details URL (without key):', detailsUrl.replace(/key=[^&]+/, 'key=***'));
              
              const detailsResponse = await fetch(detailsUrl, {
                headers: {
                  'Accept': 'application/json',
                },
              });
              if (!detailsResponse.ok) {
                console.error(`Failed to get details for location ${item.location_id}`);
                continue;
              }

              const venue: TripAdvisorLocation = await detailsResponse.json();
              
              // Check if venue already exists (by external ID or tripadvisor_id)
              const { data: existingVenue } = await supabase
                .from('venues')
                .select('id, tripadvisor_id, data_source, external_id')
                .or(`tripadvisor_id.eq.${venue.location_id},and(data_source.eq.tripadvisor,external_id.eq.${venue.location_id})`)
                .maybeSingle();

              if (existingVenue) {
                console.log(`Venue ${venue.name} already exists, skipping...`);
                totalSkipped++;
                continue;
              }

              // Get or create city
              const cityName = venue.address_obj?.city || location
              const countryCode = venue.address_obj?.country || 'US'
              const cityId = await getOrCreateCity(supabase, cityName, countryCode, parseFloat(venue.latitude), parseFloat(venue.longitude))

              // Map category, amenities, and services
              const { category, categoryId, amenityNames, serviceNames, amenityIds, serviceIds } = await mapVenueCategoryAndAmenities(supabase, venue, keyword)

              // Download and store photos
              let imageUrls: string[] = [];
              if (venue.photos && Array.isArray(venue.photos)) {
                for (const photo of venue.photos.slice(0, 3)) { // Limit to 3 photos
                  if (photo.images?.large?.url) {
                    try {
                      const imageResponse = await fetch(photo.images.large.url);
                      if (imageResponse.ok) {
                        const imageBuffer = await imageResponse.arrayBuffer();
                        const fileName = `tripadvisor-${venue.location_id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
                        
                        const { data: uploadData, error: uploadError } = await supabase.storage
                          .from('user-photos')
                          .upload(fileName, imageBuffer, {
                            contentType: 'image/jpeg',
                            upsert: false
                          });

                        if (!uploadError && uploadData) {
                          const { data: urlData } = supabase.storage
                            .from('user-photos')
                            .getPublicUrl(fileName);
                          imageUrls.push(urlData.publicUrl);
                        }
                      }
                    } catch (imageError) {
                      console.error('Error downloading image:', imageError);
                    }
                  }
                }
              }

              // Prepare tags
              const tags = ['lgbt-friendly'];
              if (keyword.includes('gay')) {
                tags.push('gay-friendly');
              }
              if (keyword.includes('sauna')) {
                tags.push('sauna', 'wellness');
              }
              if (keyword.includes('bar')) {
                tags.push('nightlife', 'drinks');
              }

              // Prepare hours data
              let hours = null;
              if (venue.hours?.periods) {
                hours = {};
                venue.hours.periods.forEach(period => {
                  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                  const dayName = dayNames[period.open.day];
                  if (dayName) {
                    hours[dayName] = {
                      open: period.open.time,
                      close: period.close.time
                    };
                  }
                });
              }

               // Prepare venue data
               const venueData = {
                 name: venue.name,
                 description: venue.description || `${category} found via TripAdvisor import for "${keyword}"`,
                 address: venue.address_obj?.address_string || '',
                 city: cityName,
                 state: venue.address_obj?.state || '',
                 country: countryCode,
                 postal_code: venue.address_obj?.postalcode || '',
                 latitude: parseFloat(venue.latitude) || null,
                 longitude: parseFloat(venue.longitude) || null,
                 phone: venue.phone || null,
                 website: venue.website || null,
                 email: venue.email || null,
                 category: category,
                 tags: tags,
                 amenities: amenityNames,
                 services: serviceNames,
                 price_range: venue.price_level ? parseInt(venue.price_level) : null,
                 hours: hours,
                 images: imageUrls,
                 verified: false,
                 featured: false,
                 tripadvisor_id: venue.location_id,
                 tripadvisor_rating: venue.rating ? parseFloat(venue.rating) : null,
                 tripadvisor_review_count: venue.num_reviews ? parseInt(venue.num_reviews) : null,
                 data_source: 'tripadvisor',
                 external_id: venue.location_id,
                 last_synced_at: new Date().toISOString(),
                 sync_status: 'synced',
                 created_by: null // System import
               };

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

              console.log(`Successfully imported venue: ${venue.name} with ${amenityNames.length} amenities and ${serviceNames.length} services`);
              totalImported++;

            } catch (venueError) {
              console.error(`Error processing venue ${item.location_id}:`, venueError);
            }

            // Add delay between requests to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (searchError) {
          console.error(`Error searching for "${keyword}" in ${location}:`, searchError);
        }

        // Add delay between searches
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`TripAdvisor import completed. Imported: ${totalImported}, Skipped: ${totalSkipped}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `TripAdvisor import completed successfully. Imported ${totalImported} venues, skipped ${totalSkipped} duplicates.`,
        imported: totalImported,
        skipped: totalSkipped
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('TripAdvisor import error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    let errorMessage = 'Unknown error occurred';
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Check if it's an API authentication error
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        statusCode = 401;
        errorMessage = 'TripAdvisor API authentication failed. Please check your API key.';
      } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        statusCode = 403;
        errorMessage = 'TripAdvisor API access forbidden. Please check your API key permissions.';
      } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        statusCode = 429;
        errorMessage = 'TripAdvisor API rate limit exceeded. Please try again later.';
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