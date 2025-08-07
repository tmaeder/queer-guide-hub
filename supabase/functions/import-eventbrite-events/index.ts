import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EventbriteEvent {
  id: string;
  name: {
    text: string;
  };
  description?: {
    text: string;
  };
  start: {
    timezone: string;
    local: string;
    utc: string;
  };
  end: {
    timezone: string;
    local: string;
    utc: string;
  };
  url: string;
  venue?: {
    id: string;
    name: string;
    address?: {
      address_1?: string;
      city?: string;
      region?: string;
      country?: string;
      latitude?: string;
      longitude?: string;
    };
  };
  organizer?: {
    id: string;
    name: string;
    url?: string;
  };
  ticket_availability?: {
    is_free?: boolean;
    minimum_ticket_price?: {
      major_value: number;
      currency: string;
    };
    maximum_ticket_price?: {
      major_value: number;
      currency: string;
    };
  };
  capacity?: number;
  category?: {
    id: string;
    name: string;
  };
  subcategory?: {
    id: string;
    name: string;
  };
}

interface EventbriteResponse {
  events: EventbriteEvent[];
  pagination: {
    page_number: number;
    page_size: number;
    page_count: number;
    object_count: number;
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

    const { query, location, categoryId } = await req.json();
    
    const eventbriteToken = Deno.env.get('EVENTBRITE_OAUTH_TOKEN');
    if (!eventbriteToken) {
      throw new Error('Eventbrite OAuth token not configured');
    }

    console.log('Importing events from Eventbrite:', { query, location, categoryId });

    // Build search parameters
    const searchParams = new URLSearchParams({
      q: query,
      'location.within': location ? `25mi` : '',
      'location.address': location || '',
      'start_date.range_start': new Date().toISOString(),
      'sort_by': 'relevance',
      'page_size': '50'
    });

    if (categoryId) {
      searchParams.append('categories', categoryId);
    }

    if (location) {
      searchParams.append('location.address', location);
      searchParams.append('location.within', '25mi');
    }

    // Make request to Eventbrite API
    const eventbriteUrl = `https://www.eventbriteapi.com/v3/events/search/?${searchParams.toString()}`;
    
    console.log('Eventbrite API URL:', eventbriteUrl);

    const eventbriteResponse = await fetch(eventbriteUrl, {
      headers: {
        'Authorization': `Bearer ${eventbriteToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!eventbriteResponse.ok) {
      const errorText = await eventbriteResponse.text();
      console.error('Eventbrite API error:', errorText);
      throw new Error(`Eventbrite API error: ${eventbriteResponse.status} - ${errorText}`);
    }

    const eventbriteData: EventbriteResponse = await eventbriteResponse.json();
    console.log(`Found ${eventbriteData.events.length} events from Eventbrite`);

    let importedCount = 0;

    for (const event of eventbriteData.events) {
      try {
        // Map event type from category
        let eventType = 'other';
        if (event.category?.name) {
          const category = event.category.name.toLowerCase();
          if (category.includes('music')) eventType = 'concert';
          else if (category.includes('food') || category.includes('drink')) eventType = 'party';
          else if (category.includes('arts') || category.includes('performing')) eventType = 'exhibition';
          else if (category.includes('sports') || category.includes('fitness')) eventType = 'sports';
          else if (category.includes('business') || category.includes('professional')) eventType = 'conference';
          else if (category.includes('community') || category.includes('culture')) eventType = 'meetup';
        }

        // Extract location data
        const address = event.venue?.address;
        const city = address?.city || '';
        const state = address?.region || '';
        const country = address?.country || 'US';
        const latitude = address?.latitude ? parseFloat(address.latitude) : null;
        const longitude = address?.longitude ? parseFloat(address.longitude) : null;
        const fullAddress = address?.address_1 || '';

        // Extract pricing
        const isFree = event.ticket_availability?.is_free || false;
        const priceMin = event.ticket_availability?.minimum_ticket_price?.major_value || null;
        const priceMax = event.ticket_availability?.maximum_ticket_price?.major_value || null;

        const eventData = {
          title: event.name.text,
          description: event.description?.text || null,
          event_type: eventType,
          start_date: event.start.utc,
          end_date: event.end.utc,
          venue_name: event.venue?.name || null,
          address: fullAddress || null,
          city: city,
          state: state,
          country: country,
          latitude: latitude,
          longitude: longitude,
          website: event.url,
          ticket_url: event.url,
          organizer_name: event.organizer?.name || null,
          organizer_contact: event.organizer?.url || null,
          is_free: isFree,
          price_min: priceMin,
          price_max: priceMax,
          max_attendees: event.capacity || null,
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
        console.error('Error processing event:', event.name.text, eventError);
        // Continue with next event
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        imported: importedCount,
        total_found: eventbriteData.events.length 
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