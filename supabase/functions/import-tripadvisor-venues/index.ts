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
    
    if (!tripadvisorApiKey) {
      throw new Error('TripAdvisor API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const keywords = ['gay sauna', 'gay bar'];
    const locations = ['New York', 'San Francisco', 'Los Angeles', 'Chicago', 'Miami', 'London', 'Berlin', 'Amsterdam', 'Barcelona', 'Paris'];
    
    let totalImported = 0;
    let totalSkipped = 0;

    for (const keyword of keywords) {
      for (const location of locations) {
        console.log(`Searching for "${keyword}" in ${location}...`);
        
        try {
          // Search for locations using TripAdvisor API
          const searchUrl = `https://api.content.tripadvisor.com/api/v1/location/search?searchQuery=${encodeURIComponent(keyword + ' ' + location)}&category=attractions,restaurants,hotels&language=en`;
          
          const searchResponse = await fetch(searchUrl, {
            headers: {
              'Accept': 'application/json',
              'X-TripAdvisor-API-Key': tripadvisorApiKey,
            },
          });

          if (!searchResponse.ok) {
            console.error(`TripAdvisor search failed for "${keyword}" in ${location}:`, searchResponse.status, searchResponse.statusText);
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
              const detailsUrl = `https://api.content.tripadvisor.com/api/v1/location/${item.location_id}/details?language=en&currency=USD`;
              
              const detailsResponse = await fetch(detailsUrl, {
                headers: {
                  'Accept': 'application/json',
                  'X-TripAdvisor-API-Key': tripadvisorApiKey,
                },
              });
              if (!detailsResponse.ok) {
                console.error(`Failed to get details for location ${item.location_id}`);
                continue;
              }

              const venue: TripAdvisorLocation = await detailsResponse.json();
              
              // Check if venue already exists (by name and location)
              const { data: existingVenue } = await supabase
                .from('venues')
                .select('id, tripadvisor_id')
                .eq('tripadvisor_id', venue.location_id)
                .maybeSingle();

              if (existingVenue) {
                console.log(`Venue ${venue.name} already exists, skipping...`);
                totalSkipped++;
                continue;
              }

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

              // Determine category based on keyword and venue data
              let category = 'bar';
              if (keyword.includes('sauna')) {
                category = 'sauna';
              } else if (venue.category?.name?.toLowerCase().includes('restaurant')) {
                category = 'restaurant';
              } else if (venue.category?.name?.toLowerCase().includes('hotel')) {
                category = 'hotel';
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
                city: venue.address_obj?.city || location,
                state: venue.address_obj?.state || '',
                country: venue.address_obj?.country || 'US',
                postal_code: venue.address_obj?.postalcode || '',
                latitude: parseFloat(venue.latitude) || null,
                longitude: parseFloat(venue.longitude) || null,
                phone: venue.phone || null,
                website: venue.website || null,
                email: venue.email || null,
                category: category,
                tags: tags,
                amenities: [],
                price_range: venue.price_level ? parseInt(venue.price_level) : null,
                hours: hours,
                images: imageUrls,
                verified: false,
                featured: false,
                tripadvisor_id: venue.location_id,
                tripadvisor_rating: venue.rating ? parseFloat(venue.rating) : null,
                tripadvisor_review_count: venue.num_reviews ? parseInt(venue.num_reviews) : null,
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

              console.log(`Successfully imported venue: ${venue.name}`);
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
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to import venues from TripAdvisor'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});