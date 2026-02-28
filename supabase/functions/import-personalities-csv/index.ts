import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, getServiceClient, requireAdmin, corsResponse, errorResponse, jsonResponse } from '../_shared/supabase-client.ts';

interface PersonalityRow {
  name: string;
  description?: string;
  birth_date?: string;
  death_date?: string;
  is_living?: boolean;
  profession?: string;
  nationality?: string;
  birth_place?: string;
  image_url?: string;
  website_url?: string;
  pronouns?: string;
  verification_status?: string;
  visibility?: string;
  is_featured?: boolean;
  fields?: string[];
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', {
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    const supabase = getServiceClient();
    const auth = await requireAdmin(req, supabase);
    if (auth instanceof Response) return auth;

    const supabaseClient = supabase;

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const csvText = await file.text();
    console.log('CSV content length:', csvText.length);

    // Parse CSV content
    const lines = csvText.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    if (lines.length === 0) {
      return new Response(JSON.stringify({ error: 'Empty CSV file' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse header row
    const headerLine = lines[0];
    console.log('Raw header line:', headerLine);
    
    const headers = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < headerLine.length; i++) {
      const char = headerLine[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        headers.push(current.trim().toLowerCase().replace(/"/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    headers.push(current.trim().toLowerCase().replace(/"/g, ''));
    
    console.log('CSV headers:', headers);

    // Validate required headers
    const requiredHeaders = ['name'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    
    if (missingHeaders.length > 0) {
      return new Response(JSON.stringify({ 
        error: `Missing required headers: ${missingHeaders.join(', ')}. Required: name` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse data rows
    const personalities: PersonalityRow[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      console.log(`Processing row ${i}: ${line}`);

      // Parse CSV values with quote handling
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"(.*)"$/, '$1'));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"(.*)"$/, '$1'));

      console.log(`Row ${i} values:`, values);

      // Create personality object
      const personality: PersonalityRow = {
        name: '',
        verification_status: 'pending',
        visibility: 'public',
        is_featured: false,
        is_living: true
      };

      headers.forEach((header, index) => {
        const value = (values[index] || '').trim();
        
        switch (header) {
          case 'name':
            personality.name = value;
            break;
          case 'description':
            if (value) personality.description = value;
            break;
          case 'birth_date':
            if (value && value !== '') personality.birth_date = value;
            break;
          case 'death_date':
            if (value && value !== '') personality.death_date = value;
            break;
          case 'is_living':
            if (value) personality.is_living = value.toLowerCase() === 'true';
            break;
          case 'profession':
            if (value) personality.profession = value;
            break;
          case 'nationality':
            if (value) personality.nationality = value;
            break;
          case 'birth_place':
            if (value) personality.birth_place = value;
            break;
          case 'image_url':
            if (value) personality.image_url = value;
            break;
          case 'website_url':
            if (value) personality.website_url = value;
            break;
          case 'pronouns':
            if (value) personality.pronouns = value;
            break;
          case 'verification_status':
            if (value && ['verified', 'pending', 'disputed'].includes(value)) {
              personality.verification_status = value;
            }
            break;
          case 'visibility':
            if (value && ['public', 'private', 'draft'].includes(value)) {
              personality.visibility = value;
            }
            break;
          case 'is_featured':
            if (value) personality.is_featured = value.toLowerCase() === 'true';
            break;
          case 'fields':
            if (value) {
              personality.fields = value.split(',').map(f => f.trim()).filter(f => f);
            }
            break;
        }
      });

      // Validate personality
      if (!personality.name.trim()) {
        errors.push(`Row ${i + 1}: Missing personality name`);
        continue;
      }

      console.log(`Row ${i + 1}: Valid personality:`, personality);
      personalities.push(personality);
    }

    console.log(`Parsed ${personalities.length} personalities with ${errors.length} errors`);

    if (personalities.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No valid personalities found in CSV',
        details: errors
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare personalities for insertion
    const personalitiesToInsert = personalities.map(personality => ({
      name: personality.name.trim(),
      description: personality.description || null,
      birth_date: personality.birth_date || null,
      death_date: personality.death_date || null,
      is_living: personality.is_living,
      profession: personality.profession || null,
      nationality: personality.nationality || null,
      birth_place: personality.birth_place || null,
      image_url: personality.image_url || null,
      website_url: personality.website_url || null,
      pronouns: personality.pronouns || null,
      verification_status: personality.verification_status,
      visibility: personality.visibility,
      is_featured: personality.is_featured,
      fields: personality.fields || [],
      view_count: 0,
      created_by: auth.userId
    }));

    console.log('Processing personalities:', personalitiesToInsert.length);

    // Insert personalities
    const { data: insertedPersonalities, error: insertError } = await supabaseClient
      .from('personalities')
      .insert(personalitiesToInsert)
      .select();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return new Response(JSON.stringify({
        error: 'Internal server error'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = {
      success: true,
      imported: insertedPersonalities?.length || 0,
      total_parsed: personalities.length,
      errors: errors.length > 0 ? errors : undefined
    };

    console.log('Import completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Import error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});