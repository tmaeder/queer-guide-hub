import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { getCorsHeaders } from '../_shared/supabase-client.ts'
import { formatICalDateTime, generateVEvent, wrapICalendar } from '../_shared/ical-generator.ts'

interface Event {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  venue_name?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  organizer_name?: string;
  organizer_contact?: string;
  website?: string;
}

const buildLocation = (event: Event): string => {
  let location = '';
  if (event.venue_name) location += event.venue_name;
  if (event.address) location += (location ? ', ' : '') + event.address;
  if (event.city) location += (location ? ', ' : '') + event.city;
  if (event.state) location += (location ? ', ' : '') + event.state;
  if (event.country) location += (location ? ', ' : '') + event.country;
  return location;
};

const buildDescription = (event: Event): string => {
  let description = event.description || '';
  if (event.organizer_name) description += `\n\nOrganizer: ${event.organizer_name}`;
  if (event.organizer_contact) description += `\nContact: ${event.organizer_contact}`;
  if (event.website) description += `\nWebsite: ${event.website}`;
  return description;
};

const generateICalEvent = (event: Event): string => {
  const startDate = formatICalDateTime(event.start_date);
  // Default to 2 hours after start if no end date is provided
  const endDate = event.end_date
    ? formatICalDateTime(event.end_date)
    : formatICalDateTime(new Date(new Date(event.start_date).getTime() + 2 * 60 * 60 * 1000).toISOString());

  return generateVEvent({
    uid: `event-${event.id}@favorites.calendar`,
    summary: event.title,
    dtstart: startDate,
    dtend: endDate,
    description: buildDescription(event) || undefined,
    location: buildLocation(event) || undefined,
    extraLines: ['STATUS:CONFIRMED', 'TRANSP:OPAQUE'],
  });
};

const generateICalendar = (events: Event[]): string => {
  const eventBlocks = events.map(event => generateICalEvent(event));

  return wrapICalendar(eventBlocks, {
    prodId: '-//Queer Guide//Favorites Calendar//EN',
    calendarName: 'My Favorite Events',
    calendarDescription: 'Events from your favorites list',
    timezone: 'UTC',
  });
};

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req)

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Calendar feed request received');

    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      console.error('Missing token parameter');
      return new Response('Missing required parameters', {
        status: 400,
        headers: corsHeaders
      });
    }

    // Initialize Supabase client with service role key for admin access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate token and resolve user_id
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('calendar_feed_tokens')
      .select('user_id, revoked')
      .eq('token', token)
      .maybeSingle();

    if (tokenErr || !tokenRow || tokenRow.revoked) {
      console.error('Invalid or revoked token');
      return new Response('Invalid token', {
        status: 401,
        headers: corsHeaders
      });
    }

    const userId = tokenRow.user_id;

    // Best-effort update of last_used_at
    await supabase
      .from('calendar_feed_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', token);

    console.log(`Fetching calendar for user: ${userId}`);

    // Fetch user's favorite events
    const { data: favoriteEvents, error: favError } = await supabase
      .from('event_favorites')
      .select('event_id')
      .eq('user_id', userId);

    if (favError) {
      console.error('Error fetching favorite events:', favError);
      throw favError;
    }

    if (!favoriteEvents || favoriteEvents.length === 0) {
      console.log('No favorite events found for user');
      // Return empty calendar
      const emptyCalendar = generateICalendar([]);
      return new Response(emptyCalendar, {
        status: 200,
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': 'attachment; filename="favorites-calendar.ics"',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          ...corsHeaders,
        },
      });
    }

    const eventIds = favoriteEvents.map(fav => fav.event_id);

    // Fetch event details
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select(`
        id,
        title,
        description,
        start_date,
        end_date,
        venue_name,
        address,
        city,
        state,
        country,
        organizer_name,
        organizer_contact,
        website
      `)
      .in('id', eventIds)
      .gte('start_date', new Date().toISOString()) // Only future events
      .order('start_date', { ascending: true });

    if (eventsError) {
      console.error('Error fetching events:', eventsError);
      throw eventsError;
    }

    console.log(`Found ${events?.length || 0} events for calendar`);

    const calendarData = generateICalendar(events || []);

    return new Response(calendarData, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="favorites-calendar.ics"',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        ...corsHeaders,
      },
    });

  } catch (error: unknown) {
    console.error('Error generating calendar feed:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        },
      }
    );
  }
};

Deno.serve(handler);
