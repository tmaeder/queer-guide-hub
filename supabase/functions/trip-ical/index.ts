/**
 * trip-ical — serve a trip's itinerary as RFC 5545 iCalendar.
 *
 * Authentication is via the existing trip share token (`trip_shares.token`),
 * which the user already has the UI to mint. The same token that powers
 * `/trips/shared/:token` works here. Anonymous (no auth) is intentional —
 * Apple/Google Calendar can't carry user credentials when they subscribe
 * to an iCal URL. Token rotation = revoke share = subscription stops.
 *
 * URL: GET https://<project>.functions.supabase.co/trip-ical?token=<token>
 *
 * Optional query params:
 *   category=places|reservations|events|all  (default: all)
 *     Filters which VEVENTs are emitted so users can subscribe to a single
 *     category in their calendar app instead of one giant feed.
 *     - places: itinerary stops (venues + custom places)
 *     - events: trip_places that resolve to an `events` row (concerts, parties, etc.)
 *     - reservations: hotel/flight/etc. reservations
 *
 * Output: text/calendar; charset=utf-8 with one VEVENT per trip_place
 * and one per reservation. CALDAV name + description are set from
 * trip.title + trip.description.
 */

// Deno edge function — runs in Supabase runtime.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

interface SharedTripDay {
  id: string;
  date: string;
  title: string | null;
}

interface SharedTripPlace {
  id: string;
  day_id: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
  custom_name: string | null;
  venues: { name: string } | null;
  events: { title: string } | null;
  hotels: { name: string } | null;
}

interface SharedTrip {
  id: string;
  title: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  trip_days: SharedTripDay[];
  trip_places: SharedTripPlace[];
}

interface SharedReservation {
  id: string;
  type: string;
  title: string;
  start_at: string | null;
  end_at: string | null;
  provider: string | null;
  confirmation_code: string | null;
  notes: string | null;
}

const escapeICS = (raw: string): string =>
  raw.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const fold = (line: string): string => {
  // RFC 5545: lines longer than 75 octets must be folded with CRLF + space.
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  out.push(line.slice(0, 75));
  i += 75;
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return out.join('\r\n');
};

const toICSDateTime = (iso: string): string => {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
};

const toICSDate = (yyyymmdd: string): string => yyyymmdd.replace(/-/g, '');

const placeName = (p: SharedTripPlace): string =>
  p.venues?.name ??
  p.events?.title ??
  p.hotels?.name ??
  p.custom_name ??
  'Trip stop';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response('token query parameter required', { status: 400, headers: cors });
  }

  const categoryParam = (url.searchParams.get('category') ?? 'all').toLowerCase();
  const validCategories = new Set(['all', 'places', 'events', 'reservations']);
  if (!validCategories.has(categoryParam)) {
    return new Response('invalid category', { status: 400, headers: cors });
  }
  const category = categoryParam as 'all' | 'places' | 'events' | 'reservations';

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Resolve the share token to a trip_id. trip_shares has RLS but service
  // role bypasses it. We mirror the existing get_shared_trip permission
  // model: any non-revoked, non-expired token grants read.
  const { data: share, error: shareErr } = await supabase
    .from('trip_shares')
    .select('trip_id, expires_at')
    .eq('token', token)
    .single();

  if (shareErr || !share) {
    return new Response('share not found', { status: 404, headers: cors });
  }
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    return new Response('share expired', { status: 410, headers: cors });
  }

  const tripId = share.trip_id as string;

  const [tripRes, reservationsRes] = await Promise.all([
    supabase
      .from('trips')
      .select(
        `id, title, description, start_date, end_date,
         trip_days(id, date, title),
         trip_places(id, day_id, start_time, end_time, duration_minutes, notes, custom_name,
           venues:venue_id(name),
           events:event_id(title),
           hotels:hotel_id(name)
         )`,
      )
      .eq('id', tripId)
      .single(),
    supabase
      .from('reservations')
      .select('id, type, title, start_at, end_at, provider, confirmation_code, notes')
      .eq('trip_id', tripId),
  ]);

  if (tripRes.error || !tripRes.data) {
    return new Response('trip not found', { status: 404, headers: cors });
  }

  const trip = tripRes.data as unknown as SharedTrip;
  const reservations = (reservationsRes.data ?? []) as SharedReservation[];

  const dayDate = new Map<string, string>();
  for (const d of trip.trip_days ?? []) dayDate.set(d.id, d.date);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//queer.guide//Trip iCal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(
      `X-WR-CALNAME:${escapeICS(
        category === 'all' ? trip.title : `${trip.title} — ${category}`,
      )}`,
    ),
    'X-WR-TIMEZONE:UTC',
  ];
  if (trip.description) {
    lines.push(fold(`X-WR-CALDESC:${escapeICS(trip.description)}`));
  }

  const now = toICSDateTime(new Date().toISOString());

  // Places. If no start_time, anchor as an all-day event on the day's date.
  // Filter by category: 'places' excludes places that are events,
  // 'events' includes only places resolving to events. 'all' includes both.
  for (const p of trip.trip_places ?? []) {
    const isEvent = !!p.events;
    if (category === 'reservations') break;
    if (category === 'places' && isEvent) continue;
    if (category === 'events' && !isEvent) continue;
    const name = placeName(p);
    const date = (p.day_id && dayDate.get(p.day_id)) || null;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:place-${p.id}@queer.guide`);
    lines.push(`DTSTAMP:${now}`);

    if (p.start_time) {
      const start = toICSDateTime(p.start_time);
      const end = p.end_time
        ? toICSDateTime(p.end_time)
        : p.duration_minutes
          ? toICSDateTime(
              new Date(new Date(p.start_time).getTime() + p.duration_minutes * 60_000).toISOString(),
            )
          : toICSDateTime(new Date(new Date(p.start_time).getTime() + 60 * 60_000).toISOString());
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${end}`);
    } else if (date) {
      const dt = toICSDate(date);
      lines.push(`DTSTART;VALUE=DATE:${dt}`);
      lines.push(`DTEND;VALUE=DATE:${dt}`);
    } else {
      lines.pop(); lines.pop(); lines.pop(); // discard begin+uid+dtstamp
      continue;
    }

    lines.push(fold(`SUMMARY:${escapeICS(name)}`));
    if (p.notes) lines.push(fold(`DESCRIPTION:${escapeICS(p.notes)}`));
    lines.push('END:VEVENT');
  }

  // Reservations. Skipped entirely if caller asked for places/events only.
  const includeReservations = category === 'all' || category === 'reservations';
  for (const r of includeReservations ? reservations : []) {
    if (!r.start_at && !r.end_at) continue;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:reservation-${r.id}@queer.guide`);
    lines.push(`DTSTAMP:${now}`);

    const start = r.start_at ?? r.end_at!;
    const end = r.end_at ?? new Date(new Date(start).getTime() + 60 * 60_000).toISOString();
    lines.push(`DTSTART:${toICSDateTime(start)}`);
    lines.push(`DTEND:${toICSDateTime(end)}`);

    const title = `${r.type}: ${r.title}`;
    lines.push(fold(`SUMMARY:${escapeICS(title)}`));

    const descParts: string[] = [];
    if (r.provider) descParts.push(`Provider: ${r.provider}`);
    if (r.confirmation_code) descParts.push(`Confirmation: ${r.confirmation_code}`);
    if (r.notes) descParts.push(r.notes);
    if (descParts.length) lines.push(fold(`DESCRIPTION:${escapeICS(descParts.join('\n'))}`));

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  const body = lines.join('\r\n') + '\r\n';
  return new Response(body, {
    headers: {
      ...cors,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'public, max-age=300', // 5 min — subscriptions poll periodically
      'Content-Disposition': `inline; filename="trip-${tripId}-${category}.ics"`,
    },
  });
});
