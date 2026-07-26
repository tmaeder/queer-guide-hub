import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts'
import type { SourceAdapter, RawItem, NormalizedItem, AdapterConfig } from '../_shared/source-adapter.ts'
import { writeToStaging } from '../_shared/source-adapter.ts'

// ============================================================
// Admin CSV venue upload.
// Parse only — rows are staged into ingestion_staging
// (source_type 'import-venues-csv') and flow through the standard
// validate → dedupe → review-gate → commit pipeline. No direct
// writes to venues.
// ============================================================

const VALID_VENUE_CATEGORIES = [
  'bar', 'club', 'restaurant', 'hotel', 'sauna', 'theater',
  'community_center', 'organization', 'event-venue', 'gallery', 'other'
] as const;

interface VenueData {
  name: string;
  description?: string;
  category: string;
  address: string;
  city: string;
  state?: string;
  country: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  website?: string;
  email?: string;
  instagram?: string;
  price_range?: number;
  tags?: string[];
  amenities?: string[];
  verified: boolean;
  is_featured: boolean;
}

function parseCSV(csvText: string): VenueData[] {
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
  const venues: VenueData[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue; // Skip empty lines

    const values = parseCSVLine(lines[i]).map(v => v.replace(/^"|"$/g, ''));

    if (values.length !== headers.length) {
      console.error(`Skipping row ${i + 1}: column count mismatch (expected ${headers.length}, got ${values.length})`);
      console.error(`Headers: ${headers.join(', ')}`);
      console.error(`Values: ${values.join(', ')}`);
      continue;
    }

    const venueData: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      const value = values[index];

      switch (header) {
        case 'name':
        case 'description':
        case 'category':
        case 'address':
        case 'city':
        case 'state':
        case 'country':
        case 'postal_code':
        case 'phone':
        case 'website':
        case 'email':
        case 'instagram':
          venueData[header] = value || null;
          break;
        case 'latitude':
        case 'longitude':
          venueData[header] = value && !isNaN(parseFloat(value)) ? parseFloat(value) : null;
          break;
        case 'price_range': {
          const priceRange = value && !isNaN(parseInt(value)) ? parseInt(value) : null;
          venueData[header] = priceRange && priceRange >= 1 && priceRange <= 4 ? priceRange : null;
          break;
        }
        case 'tags':
        case 'amenities':
          // Parse comma-separated values or JSON arrays
          if (value) {
            try {
              venueData[header] = JSON.parse(value);
            } catch {
              venueData[header] = value.split(';').map(v => v.trim()).filter(v => v);
            }
          } else {
            venueData[header] = [];
          }
          break;
        case 'verified':
        case 'featured':
        case 'is_featured':
          venueData.is_featured = value.toLowerCase() === 'true';
          break;
      }
    });

    // Validate required fields
    if (!venueData.name || !venueData.category || !venueData.address || !venueData.city || !venueData.country) {
      console.warn(`Skipping row ${i + 1}: missing required fields`);
      continue;
    }

    // Validate category against allowed values
    const category = String(venueData.category).toLowerCase();
    if (!(VALID_VENUE_CATEGORIES as readonly string[]).includes(category)) {
      console.warn(`Skipping row ${i + 1}: invalid category '${venueData.category}'. Allowed: ${VALID_VENUE_CATEGORIES.join(', ')}`);
      continue;
    }
    venueData.category = category;

    // Set defaults
    venueData.country = venueData.country || 'US';
    venueData.verified = venueData.verified || false;
    venueData.is_featured = venueData.is_featured || false;

    venues.push(venueData as unknown as VenueData);
  }

  return venues;
}

// Staging adapter: normalizes a parsed CSV row into the standard
// NormalizedItem shape the venue pipeline (validate/dedupe/commit) expects.
const venuesCsvAdapter: SourceAdapter = {
  name: 'import-venues-csv',
  entityType: 'venue',

  // fetch is driven inline by the handler (multipart file upload).
  fetch(_config: AdapterConfig): Promise<RawItem[]> {
    return Promise.resolve([])
  },

  normalize(raw: RawItem): NormalizedItem {
    const v = raw.data as unknown as VenueData & { _uploaded_by?: string }
    return {
      entityType: 'venue',
      sourceId: raw.sourceId,
      sourceName: 'import-venues-csv',
      name: v.name,
      description: v.description || '',
      category: v.category,
      location: {
        lat: v.latitude ?? undefined,
        lng: v.longitude ?? undefined,
        address: v.address || '',
        city: v.city || '',
        country: v.country || '',
      },
      urls: v.website ? [String(v.website)] : [],
      tags: v.tags || [],
      contacts: {
        phone: v.phone || undefined,
        email: v.email || undefined,
        website: v.website || undefined,
      },
      metadata: {
        state: v.state ?? null,
        postal_code: v.postal_code ?? null,
        instagram: v.instagram ?? null,
        price_range: v.price_range ?? null,
        amenity_candidates: v.amenities || [],
        uploaded_by: v._uploaded_by ?? null,
        data_source: 'csv_upload',
      },
    } as NormalizedItem
  },

  getSourceId(raw: RawItem): string {
    return raw.sourceId
  },
}

/** Deterministic per-row source id so re-uploading the same CSV is idempotent
 * at the dedup stage (name + city + country key). */
function rowSourceId(v: VenueData): string {
  const key = `${v.name}|${v.city}|${v.country}`.toLowerCase().replace(/\s+/g, ' ').trim()
  return `csv-${key.replace(/[^a-z0-9|]+/g, '-').slice(0, 180)}`
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  console.log('Import venues CSV function called');

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

    const venues = parseCSV(csvText);
    console.log(`Parsed ${venues.length} venues from CSV`);

    if (venues.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid venues found in CSV' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Stage every parsed row for the review pipeline.
    const rawItems: RawItem[] = venues.map(venue => ({
      sourceId: rowSourceId(venue),
      data: { ...(venue as unknown as Record<string, unknown>), _uploaded_by: auth.userId },
    }));

    const staged = await writeToStaging(supabaseClient, venuesCsvAdapter, rawItems, {
      batchSize: rawItems.length,
      targetTable: 'venues',
    });

    console.log(`Staged ${staged} of ${venues.length} venues for the review pipeline`);

    return new Response(
      JSON.stringify({
        message: `Staged ${staged} venues for the review pipeline`,
        staged,
        total_processed: venues.length
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in import-venues-csv function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
