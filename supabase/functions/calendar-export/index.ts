import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { getCorsHeaders, getServiceClient, requireAdmin, corsResponse, errorResponse, jsonResponse } from '../_shared/supabase-client.ts'

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

    // Format dates for iCalendar
    const formatDate = (date: string) => {
      return new Date(date).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    // Generate unique UID
    const uid = `event-${event.id}@queer.guide`;

    // Build location string
    const location = [
      event.venues?.name || event.venue_name,
      event.venues?.address || event.address,
      event.city,
      event.state
    ].filter(Boolean).join(', ');

    // Generate iCalendar content
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Queer Guide//Event Export//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${formatDate(event.start_date)}`,
      event.end_date ? `DTEND:${formatDate(event.end_date)}` : '',
      `SUMMARY:${event.title}`,
      event.description ? `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}` : '',
      location ? `LOCATION:${location}` : '',
      event.organizer_name ? `ORGANIZER:CN=${event.organizer_name}` : '',
      event.website ? `URL:${event.website}` : '',
      `DTSTAMP:${formatDate(new Date().toISOString())}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(line => line !== '').join('\r\n');

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