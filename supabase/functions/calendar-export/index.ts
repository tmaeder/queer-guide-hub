import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { withIndexedOccurrence } from '../_shared/event-occurrence-timing.ts'
import { getCorsHeaders } from '../_shared/supabase-client.ts'
import { formatICalDateTime, generateVEvent, wrapICalendar } from '../_shared/ical-generator.ts'

Deno.serve(async (req) => {
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
    // Caller-scoped, not service role: events RLS hides safety-gated events
    // (high-risk countries) from anonymous callers; service role bypassed it.
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` } },
    });

    // Fetch event details
    const { data: event, error } = await supabase
      .from('events')
      .select(`
        *,
        venues:venues!venue_id (
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

    let calendarEvent = event;
    if (event.schedule?.source === 'agendaq-raw' && event.schedule?.kind === 'recurrence') {
      const now = new Date().toISOString();
      const { data: occurrence, error: occurrenceError } = await supabase.from('event_dates')
        .select('open_at,close_at').eq('event_id', event.id)
        .or(`close_at.gte.${now},and(close_at.is.null,open_at.gte.${now})`)
        .order('open_at', { ascending: true }).limit(1).maybeSingle();
      if (occurrenceError || !occurrence) {
        return new Response(JSON.stringify({ error: 'No upcoming scheduled date is available' }), {
          status: occurrenceError ? 503 : 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      calendarEvent = withIndexedOccurrence(event, occurrence);
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
      dtstart: formatICalDateTime(calendarEvent.start_date),
      dtend: calendarEvent.end_date ? formatICalDateTime(calendarEvent.end_date) : undefined,
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
