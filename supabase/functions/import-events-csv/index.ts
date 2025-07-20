import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EventData {
  title: string;
  description?: string;
  event_type: string;
  venue_name?: string;
  address?: string;
  city: string;
  state?: string;
  country: string;
  start_date: string;
  end_date?: string;
  price_min?: number;
  price_max?: number;
  is_free: boolean;
  max_attendees?: number;
  age_restriction?: string;
  website?: string;
  ticket_url?: string;
  organizer_name?: string;
  organizer_contact?: string;
  featured: boolean;
}

function parseCSV(csvText: string): EventData[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  // Proper CSV parsing function that handles quoted values with commas
  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    // Add the last field
    result.push(current.trim());
    return result;
  }

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, ''));
  const events: EventData[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue; // Skip empty lines
    
    const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, ''));
    
    if (values.length !== headers.length) {
      console.error(`Skipping row ${i + 1}: column count mismatch (expected ${headers.length}, got ${values.length})`);
      console.error(`Headers: ${headers.join(', ')}`);
      console.error(`Values: ${values.join(', ')}`);
      continue;
    }

    const eventData: any = {};
    headers.forEach((header, index) => {
      const value = values[index];
      
      switch (header) {
        case 'title':
        case 'description':
        case 'event_type':
        case 'venue_name':
        case 'address':
        case 'city':
        case 'state':
        case 'country':
        case 'start_date':
        case 'end_date':
        case 'age_restriction':
        case 'website':
        case 'ticket_url':
        case 'organizer_name':
        case 'organizer_contact':
          eventData[header] = value || null;
          break;
        case 'price_min':
        case 'price_max':
          eventData[header] = value && !isNaN(parseFloat(value)) ? parseFloat(value) : null;
          break;
        case 'max_attendees':
          eventData[header] = value && !isNaN(parseInt(value)) ? parseInt(value) : null;
          break;
        case 'is_free':
        case 'featured':
          eventData[header] = value.toLowerCase() === 'true';
          break;
      }
    });

    // Validate required fields
    if (!eventData.title || !eventData.event_type || !eventData.city || !eventData.country || !eventData.start_date) {
      console.warn(`Skipping row ${i + 1}: missing required fields`);
      continue;
    }

    // Validate date format
    try {
      new Date(eventData.start_date).toISOString();
      if (eventData.end_date) {
        new Date(eventData.end_date).toISOString();
      }
    } catch (error) {
      console.warn(`Skipping row ${i + 1}: invalid date format`);
      continue;
    }

    events.push(eventData as EventData);
  }

  return events;
}

serve(async (req) => {
  console.log('Import events CSV function called');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if user has admin role
    const { data: userRoles, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (roleError || !userRoles?.some(role => role.role === 'admin')) {
      return new Response(
        JSON.stringify({ error: 'Admin privileges required' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return new Response(
        JSON.stringify({ error: 'No file provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const csvText = await file.text();
    console.log('CSV file read, parsing...');

    const events = parseCSV(csvText);
    console.log(`Parsed ${events.length} events from CSV`);

    if (events.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid events found in CSV' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Process events and create venues/cities if needed
    const eventsWithCreatorAndVenues = [];
    
    for (const event of events) {
      let venue_id = null;
      let city_id = null;
      
      // First, handle city creation/lookup
      if (event.city && event.country) {
        // Check if city exists
        const { data: existingCities } = await supabaseClient
          .from('cities')
          .select('id')
          .eq('name', event.city)
          .eq('country_id', (
            await supabaseClient
              .from('countries')
              .select('id')
              .eq('name', event.country)
              .limit(1)
              .single()
          )?.data?.id || '')
          .limit(1);
        
        if (existingCities && existingCities.length > 0) {
          city_id = existingCities[0].id;
        } else {
          // Get country_id first
          const { data: country } = await supabaseClient
            .from('countries')
            .select('id')
            .eq('name', event.country)
            .limit(1)
            .single();
          
          if (country) {
            // Create new city
            const cityData = {
              name: event.city,
              country_id: country.id,
              region_name: event.state || null
            };
            
            const { data: newCity, error: cityError } = await supabaseClient
              .from('cities')
              .insert(cityData)
              .select('id')
              .single();
            
            if (cityError) {
              console.error('Failed to create city:', cityError);
            } else {
              city_id = newCity.id;
              console.log(`Created new city: ${event.city}, ${event.country}`);
            }
          }
        }
      }
      
      // If venue_name is provided, check if venue exists or create it
      if (event.venue_name) {
        // Check if venue exists
        const { data: existingVenues } = await supabaseClient
          .from('venues')
          .select('id')
          .eq('name', event.venue_name)
          .eq('city', event.city)
          .eq('country', event.country)
          .limit(1);
        
        if (existingVenues && existingVenues.length > 0) {
          venue_id = existingVenues[0].id;
        } else {
          // Create new venue
          const venueData = {
            name: event.venue_name,
            address: event.address || '',
            city: event.city,
            state: event.state,
            country: event.country,
            category: 'event_venue',
            created_by: user.id,
            verified: false,
            city_id: city_id
          };
          
          const { data: newVenue, error: venueError } = await supabaseClient
            .from('venues')
            .insert(venueData)
            .select('id')
            .single();
          
          if (venueError) {
            console.error('Failed to create venue:', venueError);
          } else {
            venue_id = newVenue.id;
            console.log(`Created new venue: ${event.venue_name}`);
          }
        }
      }
      
      eventsWithCreatorAndVenues.push({
        ...event,
        created_by: user.id,
        venue_id: venue_id
      });
    }

    // Insert events into database
    const { data: insertedEvents, error: insertError } = await supabaseClient
      .from('events')
      .insert(eventsWithCreatorAndVenues)
      .select();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to insert events into database' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Successfully inserted ${insertedEvents?.length || 0} events`);

    return new Response(
      JSON.stringify({ 
        message: 'Events imported successfully',
        imported: insertedEvents?.length || 0,
        total_processed: events.length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in import-events-csv function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});