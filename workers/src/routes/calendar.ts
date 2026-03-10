/**
 * Calendar functions — export, feed, token.
 * Uses Supabase REST for DB reads/writes.
 */
import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../lib/response';
import { supabaseRest, getUser } from '../supabase-rest';

// ─── iCal Utilities ──────────────────────────────────────────
function formatICalDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICalText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function generateVEvent(opts: {
  uid: string;
  summary: string;
  dtstart: string;
  dtend?: string;
  description?: string;
  location?: string;
  organizer?: string;
  url?: string;
}): string {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${formatICalDateTime(new Date().toISOString())}`,
    `DTSTART:${opts.dtstart}`,
  ];
  if (opts.dtend) lines.push(`DTEND:${opts.dtend}`);
  lines.push(`SUMMARY:${escapeICalText(opts.summary)}`);
  if (opts.description) lines.push(`DESCRIPTION:${escapeICalText(opts.description)}`);
  if (opts.location) lines.push(`LOCATION:${escapeICalText(opts.location)}`);
  if (opts.organizer) lines.push(`ORGANIZER:${escapeICalText(opts.organizer)}`);
  if (opts.url) lines.push(`URL:${opts.url}`);
  lines.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT');
  return lines.join('\r\n');
}

function wrapICalendar(events: string[], calName: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Queer Guide//Calendar//EN',
    `X-WR-CALNAME:${calName}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

// ─── calendar-export ─────────────────────────────────────────
interface EventRow {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  venue_name?: string;
  address?: string;
  city?: string;
  state?: string;
  organizer_name?: string;
  website?: string;
  venues?: { name?: string; address?: string; city?: string; state?: string };
}

export async function handleCalendarExport(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const { eventId } = await req.json<{ eventId?: string }>();
  if (!eventId) return errorResponse('Event ID is required', 400);

  const { data, error } = await supabaseRest<EventRow[]>(
    env,
    `/rest/v1/events?id=eq.${eventId}&select=*,venues(name,address,city,state)&limit=1`,
  );

  if (error || !data?.length) return errorResponse('Event not found', 404);
  const event = data[0];

  const location = [
    event.venues?.name || event.venue_name,
    event.venues?.address || event.address,
    event.city,
    event.state,
  ].filter(Boolean).join(', ');

  const vevent = generateVEvent({
    uid: `event-${event.id}@queer.guide`,
    summary: event.title,
    dtstart: formatICalDateTime(event.start_date),
    dtend: event.end_date ? formatICalDateTime(event.end_date) : undefined,
    description: event.description,
    location: location || undefined,
    organizer: event.organizer_name,
    url: event.website,
  });

  const ics = wrapICalendar([vevent], event.title);

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar',
      'Content-Disposition': `attachment; filename="${event.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics"`,
    },
  });
}

// ─── calendar-token ──────────────────────────────────────────
export async function handleCalendarToken(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Unauthorized', 401);

  const token = authHeader.replace('Bearer ', '');
  const user = await getUser(env, token);
  if (!user) return errorResponse('Unauthorized', 401);

  // Check for existing token
  const { data: existing } = await supabaseRest<Array<{ token: string }>>(
    env,
    `/rest/v1/calendar_feed_tokens?user_id=eq.${user.id}&revoked=eq.false&select=token&limit=1`,
  );

  let feedToken = existing?.[0]?.token;

  if (!feedToken) {
    // Generate a secure random token
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    feedToken = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    await supabaseRest(env, '/rest/v1/calendar_feed_tokens', {
      method: 'POST',
      body: { user_id: user.id, token: feedToken },
    });
  }

  // Build feed URL pointing to the Worker
  const workerUrl = new URL(req.url).origin;
  const feedUrl = `${workerUrl}/calendar-feed?token=${feedToken}`;

  return jsonResponse({ url: feedUrl, token: feedToken }, 200);
}

// ─── calendar-feed ───────────────────────────────────────────
export async function handleCalendarFeed(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response('Missing token', { status: 400 });
  }

  // Validate token
  const { data: tokenRows } = await supabaseRest<Array<{ user_id: string; revoked: boolean }>>(
    env,
    `/rest/v1/calendar_feed_tokens?token=eq.${token}&select=user_id,revoked&limit=1`,
  );

  if (!tokenRows?.length || tokenRows[0].revoked) {
    return new Response('Invalid token', { status: 401 });
  }

  const userId = tokenRows[0].user_id;

  // Update last_used_at (fire and forget)
  supabaseRest(env, `/rest/v1/calendar_feed_tokens?token=eq.${token}`, {
    method: 'PATCH',
    body: { last_used_at: new Date().toISOString() },
  });

  // Fetch favorite event IDs
  const { data: favs } = await supabaseRest<Array<{ event_id: string }>>(
    env,
    `/rest/v1/event_favorites?user_id=eq.${userId}&select=event_id`,
  );

  if (!favs?.length) {
    const empty = wrapICalendar([], 'My Favorite Events');
    return new Response(empty, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="favorites-calendar.ics"',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const ids = favs.map((f) => f.event_id);
  const idFilter = `id=in.(${ids.join(',')})`;
  const now = new Date().toISOString();

  const { data: events } = await supabaseRest<EventRow[]>(
    env,
    `/rest/v1/events?${idFilter}&start_date=gte.${now}&select=id,title,description,start_date,end_date,venue_name,address,city,state,organizer_name,website&order=start_date.asc`,
  );

  const vevents = (events || []).map((event) => {
    const loc = [event.venue_name, event.address, event.city, event.state]
      .filter(Boolean)
      .join(', ');
    const endDate = event.end_date
      ? formatICalDateTime(event.end_date)
      : formatICalDateTime(
          new Date(new Date(event.start_date).getTime() + 2 * 60 * 60 * 1000).toISOString(),
        );

    return generateVEvent({
      uid: `event-${event.id}@favorites.calendar`,
      summary: event.title,
      dtstart: formatICalDateTime(event.start_date),
      dtend: endDate,
      description: event.description,
      location: loc || undefined,
    });
  });

  const ical = wrapICalendar(vevents, 'My Favorite Events');

  return new Response(ical, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="favorites-calendar.ics"',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
