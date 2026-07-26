import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'

// ============================================================
// Admin CSV event upload.
// Parse only — rows are staged into ingestion_staging via
// stage_event_for_commit (source_type 'import-events-csv') and flow
// through the standard validate → dedupe → review-gate → commit
// pipeline (hourly ev-drain-* crons). No direct writes to
// events/venues/cities — the commit stage resolves venue/city.
// ============================================================

const VALID_EVENT_TYPES = [
  'party', 'festival', 'pride', 'fetish', 'community',
  'meetup', 'conference', 'workshop', 'concert', 'film', 'drag',
  'sports', 'art', 'theater', 'fundraiser', 'protest', 'social',
  'fair', 'other'
] as const;

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
  is_featured: boolean;
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

    const eventData: Record<string, unknown> = {};
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
        case 'is_featured':
          eventData.is_featured = value.toLowerCase() === 'true';
          break;
      }
    });

    // Validate required fields
    if (!eventData.title || !eventData.event_type || !eventData.city || !eventData.country || !eventData.start_date) {
      console.warn(`Skipping row ${i + 1}: missing required fields`);
      continue;
    }

    // Validate event_type against allowed values
    const eventType = String(eventData.event_type).toLowerCase();
    if (!(VALID_EVENT_TYPES as readonly string[]).includes(eventType)) {
      console.warn(`Skipping row ${i + 1}: invalid event_type '${eventData.event_type}'. Allowed: ${VALID_EVENT_TYPES.join(', ')}`);
      continue;
    }
    eventData.event_type = eventType;

    // Validate date format
    try {
      new Date(String(eventData.start_date)).toISOString();
      if (eventData.end_date) {
        new Date(String(eventData.end_date)).toISOString();
      }
    } catch (_error) {
      console.warn(`Skipping row ${i + 1}: invalid date format`);
      continue;
    }

    events.push(eventData as unknown as EventData);
  }

  return events;
}

/** Deterministic per-row source id so re-uploading the same CSV is idempotent
 * (stage_event_for_commit also hashes the payload). */
function rowSourceId(e: EventData): string {
  const key = `${e.title}|${e.start_date}|${e.city}`.toLowerCase().replace(/\s+/g, ' ').trim()
  return `csv-${key.replace(/[^a-z0-9|]+/g, '-').slice(0, 180)}`
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  console.log('Import events CSV function called');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = getServiceClient();
    const auth = await requireAdmin(req, supabaseClient);
    if (auth instanceof Response) return auth;

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

    // Stage every parsed row for the review pipeline. The commit stage
    // resolves venue_name/city to venue_id/city_id — no pre-creation here.
    let staged = 0;

    for (const event of events) {
      const normalized = {
        ...event,
        uploaded_by: auth.userId,
        status: 'active',
      };

      const { error } = await supabaseClient.rpc('stage_event_for_commit', {
        p_source_type: 'import-events-csv',
        p_source_name: 'events-csv-upload',
        p_source_entity_id: rowSourceId(event),
        p_raw: event as unknown as Record<string, unknown>,
        p_normalized: normalized,
        p_source_url: event.website || event.ticket_url || null,
      });

      if (error) {
        console.error('Error staging event:', event.title, error);
      } else {
        staged++;
      }
    }

    console.log(`Staged ${staged} of ${events.length} events for the review pipeline`);

    return new Response(
      JSON.stringify({
        message: `Staged ${staged} events for the review pipeline`,
        staged,
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
