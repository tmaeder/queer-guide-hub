import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5'
import { enrichVenueWithAI } from '../_shared/ai-enrichment.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
  featured: boolean;
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

    const venueData: any = {};
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
        case 'price_range':
          const priceRange = value && !isNaN(parseInt(value)) ? parseInt(value) : null;
          venueData[header] = priceRange && priceRange >= 1 && priceRange <= 4 ? priceRange : null;
          break;
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
          venueData[header] = value.toLowerCase() === 'true';
          break;
      }
    });

    // Validate required fields
    if (!venueData.name || !venueData.category || !venueData.address || !venueData.city || !venueData.country) {
      console.warn(`Skipping row ${i + 1}: missing required fields`);
      continue;
    }

    // Set defaults
    venueData.country = venueData.country || 'US';
    venueData.verified = venueData.verified || false;
    venueData.featured = venueData.featured || false;

    venues.push(venueData as VenueData);
  }

  return venues;
}

serve(async (req) => {
  console.log('Import venues CSV function called');

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

    // Process venues, add creator, and enrich with AI
    const venuesWithCreator = venues.map(venue => ({
      ...venue,
      created_by: user.id
    }));

    // AI enrichment — enhance venues missing descriptions
    for (const venue of venuesWithCreator) {
      if (!venue.description) {
        try {
          const aiEnrichment = await enrichVenueWithAI(supabaseClient, venue)
          if (aiEnrichment) {
            if (aiEnrichment.description) venue.description = aiEnrichment.description as string
            if (aiEnrichment.tags && !venue.tags?.length) venue.tags = aiEnrichment.tags as string[]
          }
        } catch (e) { console.warn('AI enrichment skipped for venue:', venue.name, e) }
      }
    }

    // Insert venues into database
    const { data: insertedVenues, error: insertError } = await supabaseClient
      .from('venues')
      .insert(venuesWithCreator)
      .select();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to insert venues into database' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Successfully inserted ${insertedVenues?.length || 0} venues`);

    return new Response(
      JSON.stringify({ 
        message: 'Venues imported successfully',
        imported: insertedVenues?.length || 0,
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