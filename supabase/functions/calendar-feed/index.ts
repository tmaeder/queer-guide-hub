import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
};

const escapeText = (text: string): string => {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
};

const generateICalEvent = (event: Event): string => {
  const startDate = formatDateTime(event.start_date);
  const endDate = event.end_date ? formatDateTime(event.end_date) : formatDateTime(new Date(new Date(event.start_date).getTime() + 2 * 60 * 60 * 1000).toISOString()); // Default 2 hours if no end date
  
  let location = '';
  if (event.venue_name) location += event.venue_name;
  if (event.address) location += (location ? ', ' : '') + event.address;
  if (event.city) location += (location ? ', ' : '') + event.city;
  if (event.state) location += (location ? ', ' : '') + event.state;
  if (event.country) location += (location ? ', ' : '') + event.country;

  let description = event.description || '';
  if (event.organizer_name) description += `\n\nOrganizer: ${event.organizer_name}`;
  if (event.organizer_contact) description += `\nContact: ${event.organizer_contact}`;
  if (event.website) description += `\nWebsite: ${event.website}`;

  const uid = `event-${event.id}@favorites.calendar`;
  const now = formatDateTime(new Date().toISOString());

  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${startDate}`,
    `DTEND:${endDate}`,
    `DTSTAMP:${now}`,
    `SUMMARY:${escapeText(event.title)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : '',
    location ? `LOCATION:${escapeText(location)}` : '',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT'
  ].filter(Boolean).join('\r\n');
};

const generateICalendar = (events: Event[], userId: string): string => {
  const now = formatDateTime(new Date().toISOString());
  
  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Queer Guide//Favorites Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:My Favorite Events`,
    `X-WR-CALDESC:Events from your favorites list`,
    `X-WR-TIMEZONE:UTC`
  ].join('\r\n');

  const eventBlocks = events.map(event => generateICalEvent(event));
  
  const footer = 'END:VCALENDAR';

  return [header, ...eventBlocks, footer].join('\r\n');
};

const handler = async (req: Request): Promise<Response> => {
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
      const emptyCalendar = generateICalendar([], userId);
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

    const calendarData = generateICalendar(events || [], userId);

    return new Response(calendarData, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="favorites-calendar.ics"',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error('Error generating calendar feed:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
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

serve(handler);