import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { getCorsHeaders, getServiceClient, requireAdmin, corsResponse, errorResponse, jsonResponse } from '../_shared/supabase-client.ts'
import { formatICalDateTime, generateVEvent, wrapICalendar } from '../_shared/ical-generator.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { eventId } = await req.json();

    if (!eventId) {
      return new Response(
        JSON.stringify({ error: 'Event ID is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch event details
    const { data: event, error } = await supabase
      .from('events')
      .select(`
        *,
        venues (
          name,
          address,
          city,
          state
        )
      `)
      .eq('id', eventId)
      .single();

    if (error || !event) {
      console.error('Error fetching event:', error);
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Build location string
    const location = [
      event.venues?.name || event.venue_name,
      event.venues?.address || event.address,
      event.city,
      event.state
    ].filter(Boolean).join(', ');

    // Build VEVENT using shared utility
    const vevent = generateVEvent({
      uid: `event-${event.id}@queer.guide`,
      summary: event.title,
      dtstart: formatICalDateTime(event.start_date),
      dtend: event.end_date ? formatICalDateTime(event.end_date) : undefined,
      description: event.description || undefined,
      location: location || undefined,
      organizer: event.organizer_name || undefined,
      url: event.website || undefined,
    });

    // Wrap in VCALENDAR using shared utility
    const icsContent = wrapICalendar([vevent], {
      prodId: '-//Queer Guide//Event Export//EN',
    });

    console.log('Generated calendar for event:', event.title);

    return new Response(icsContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar',
        'Content-Disposition': `attachment; filename="${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics"`
      }
    });

  } catch (error) {
    console.error('Error in calendar-export function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
