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

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const events: EventData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    
    if (values.length !== headers.length) {
      console.warn(`Skipping row ${i + 1}: column count mismatch`);
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

    // Add created_by field to all events
    const eventsWithCreator = events.map(event => ({
      ...event,
      created_by: user.id
    }));

    // Insert events into database
    const { data: insertedEvents, error: insertError } = await supabaseClient
      .from('events')
      .insert(eventsWithCreator)
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