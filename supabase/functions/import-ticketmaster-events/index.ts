import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TicketmasterEvent {
  id: string;
  name: string;
  description?: string;
  info?: string;
  dates: {
    start: {
      localDate: string;
      localTime?: string;
      dateTime?: string;
    };
    end?: {
      localDate: string;
      localTime?: string;
      dateTime?: string;
    };
    timezone?: string;
  };
  url: string;
  _embedded?: {
    venues?: Array<{
      id: string;
      name: string;
      address?: {
        line1?: string;
        line2?: string;
      };
      city?: {
        name: string;
      };
      state?: {
        name: string;
        stateCode: string;
      };
      country?: {
        name: string;
        countryCode: string;
      };
      location?: {
        latitude: string;
        longitude: string;
      };
    }>;
    attractions?: Array<{
      id: string;
      name: string;
    }>;
  };
  priceRanges?: Array<{
    type: string;
    currency: string;
    min: number;
    max: number;
  }>;
  seatmap?: {
    staticUrl: string;
  };
  accessibility?: {
    ticketLimit?: number;
  };
  classifications?: Array<{
    primary: boolean;
    segment?: {
      id: string;
      name: string;
    };
    genre?: {
      id: string;
      name: string;
    };
    subGenre?: {
      id: string;
      name: string;
    };
  }>;
  promoter?: {
    id: string;
    name: string;
    description?: string;
  };
  pleaseNote?: string;
  ageRestrictions?: {
    legalAgeEnforced: boolean;
  };
}

interface TicketmasterResponse {
  _embedded?: {
    events: TicketmasterEvent[];
  };
  page: {
    size: number;
    totalElements: number;
    totalPages: number;
    number: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { keyword, city, countryCode, classificationName } = await req.json();
    
    const ticketmasterApiKey = Deno.env.get('TICKETMASTER_API_KEY');
    if (!ticketmasterApiKey) {
      throw new Error('Ticketmaster API key not configured');
    }

    console.log('Importing events from Ticketmaster:', { keyword, city, countryCode, classificationName });

    // Create background task for processing
    const backgroundTask = async () => {
      console.log('Starting background task for Ticketmaster import');
      
      // Build search parameters
      const searchParams = new URLSearchParams({
        apikey: ticketmasterApiKey,
        keyword: keyword,
        countryCode: countryCode,
        size: '50',
        sort: 'relevance,desc'
      });

      if (city) {
        searchParams.append('city', city);
      }

      if (classificationName) {
        searchParams.append('classificationName', classificationName);
      }

      // Make request to Ticketmaster API
      const ticketmasterUrl = `https://app.ticketmaster.com/discovery/v2/events.json?${searchParams.toString()}`;
      
      console.log('Ticketmaster API URL:', ticketmasterUrl.replace(ticketmasterApiKey, '[REDACTED]'));

      try {
        const ticketmasterResponse = await fetch(ticketmasterUrl, {
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!ticketmasterResponse.ok) {
          const errorText = await ticketmasterResponse.text();
          console.error('Ticketmaster API error:', errorText);
          throw new Error(`Ticketmaster API error: ${ticketmasterResponse.status} - ${errorText}`);
        }

        const ticketmasterData: TicketmasterResponse = await ticketmasterResponse.json();
        const events = ticketmasterData._embedded?.events || [];
        
        console.log(`Found ${events.length} events from Ticketmaster`);

        let importedCount = 0;

        for (const event of events) {
          try {
            // Map event type from classification
            let eventType = 'other';
            const classification = event.classifications?.[0];
            if (classification?.segment?.name) {
              const segment = classification.segment.name.toLowerCase();
              if (segment.includes('music')) eventType = 'concert';
              else if (segment.includes('sports')) eventType = 'sports';
              else if (segment.includes('arts') || segment.includes('theatre')) eventType = 'theater';
              else if (segment.includes('film')) eventType = 'other';
            }

            // Extract venue data
            const venue = event._embedded?.venues?.[0];
            const address = venue?.address;
            const city = venue?.city?.name || '';
            const state = venue?.state?.stateCode || venue?.state?.name || '';
            const country = venue?.country?.countryCode || countryCode;
            const latitude = venue?.location?.latitude ? parseFloat(venue.location.latitude) : null;
            const longitude = venue?.location?.longitude ? parseFloat(venue.location.longitude) : null;
            const fullAddress = [address?.line1, address?.line2].filter(Boolean).join(', ');

            // Extract pricing
            const priceRange = event.priceRanges?.[0];
            const priceMin = priceRange?.min || null;
            const priceMax = priceRange?.max || null;
            const isFree = priceMin === 0 && priceMax === 0;

            // Build dates
            const startDate = event.dates.start.dateTime || 
              `${event.dates.start.localDate}T${event.dates.start.localTime || '00:00:00'}`;
            
            const endDate = event.dates.end?.dateTime || 
              (event.dates.end?.localDate ? `${event.dates.end.localDate}T${event.dates.end.localTime || '23:59:59'}` : null);

            // Age restrictions
            let ageRestriction = null;
            if (event.ageRestrictions?.legalAgeEnforced) {
              ageRestriction = '18+';
            }

            const eventData = {
              title: event.name,
              description: event.description || event.info || event.pleaseNote || null,
              event_type: eventType,
              start_date: startDate,
              end_date: endDate,
              venue_name: venue?.name || null,
              address: fullAddress || null,
              city: city,
              state: state,
              country: country,
              latitude: latitude,
              longitude: longitude,
              website: event.url,
              ticket_url: event.url,
              organizer_name: event.promoter?.name || null,
              organizer_contact: event.promoter?.description || null,
              is_free: isFree,
              price_min: priceMin,
              price_max: priceMax,
              age_restriction: ageRestriction,
              max_attendees: event.accessibility?.ticketLimit || null,
              status: 'active',
              featured: false
            };

            console.log('Inserting event:', eventData.title);

            const { error } = await supabaseClient
              .from('events')
              .insert(eventData);

            if (error) {
              console.error('Error inserting event:', error);
              // Continue with next event instead of failing completely
            } else {
              importedCount++;
            }
          } catch (eventError) {
            console.error('Error processing event:', event.name, eventError);
            // Continue with next event
          }
        }

        console.log(`Background task completed. Imported ${importedCount} out of ${events.length} events`);
      } catch (error) {
        console.error('Background task error:', error);
      }
    };

    // Start the background task
    EdgeRuntime.waitUntil(backgroundTask());

    // Return immediate response
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Ticketmaster import started in background',
        keyword: keyword,
        city: city,
        countryCode: countryCode
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: 'Check the function logs for more details'
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});