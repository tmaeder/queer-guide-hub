import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdultModelRow {
  'pornhub-profile': string;
  picture: string;
  name: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the user from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user authentication
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user has admin role
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAdmin = userRoles?.some(ur => ur.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse the uploaded file
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const csvText = await file.text();
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 2) {
      return new Response(JSON.stringify({ 
        error: 'CSV file must contain at least a header row and one data row' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse CSV headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    console.log('CSV Headers:', headers);

    // Validate required headers
    const requiredHeaders = ['pornhub-profile', 'picture', 'name'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    
    if (missingHeaders.length > 0) {
      return new Response(JSON.stringify({ 
        error: `Missing required headers: ${missingHeaders.join(', ')}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse CSV rows
    const rows: AdultModelRow[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let j = 0; j < lines[i].length; j++) {
          const char = lines[i][j];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim());

        if (values.length !== headers.length) {
          errors.push(`Row ${i + 1}: Expected ${headers.length} columns, got ${values.length}`);
          continue;
        }

        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index]?.replace(/"/g, '') || '';
        });

        rows.push(row as AdultModelRow);
      } catch (error) {
        errors.push(`Row ${i + 1}: Failed to parse - ${error.message}`);
      }
    }

    console.log(`Parsed ${rows.length} rows from CSV`);

    // Validate and prepare personalities data
    const personalitiesData = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // Validate required fields
      if (!row.name || row.name.trim() === '') {
        errors.push(`Row ${i + 2}: Name is required`);
        continue;
      }

      const personalityData = {
        name: row.name.trim(),
        profession: 'adult model',
        bio: null,
        birth_date: null,
        death_date: null,
        nationality: null,
        birth_place: null,
        image_url: row.picture && row.picture.trim() !== '' ? row.picture.trim() : null,
        verification_status: 'pending',
        is_featured: false,
        is_living: true,
        fields: row['pornhub-profile'] && row['pornhub-profile'].trim() !== '' 
          ? { pornhub_profile: row['pornhub-profile'].trim() }
          : null,
        view_count: 0,
        created_by: user.id
      };

      personalitiesData.push(personalityData);
    }

    // Insert personalities into database
    let insertedCount = 0;
    if (personalitiesData.length > 0) {
      const { data: insertedPersonalities, error: insertError } = await supabase
        .from('personalities')
        .insert(personalitiesData)
        .select('id');

      if (insertError) {
        console.error('Insert error:', insertError);
        errors.push(`Database insert error: ${insertError.message}`);
      } else {
        insertedCount = insertedPersonalities?.length || 0;
        console.log(`Successfully inserted ${insertedCount} personalities`);
      }
    }

    const result = {
      success: errors.length === 0 && insertedCount > 0,
      imported: insertedCount,
      total_parsed: rows.length,
      errors: errors.length > 0 ? errors : undefined
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});