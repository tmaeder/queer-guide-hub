import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TagRow {
  name: string;
  category: string;
  description?: string;
}

serve(async (req) => {
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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      console.error('Authentication error:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user has admin role
    const { data: userRoles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAdmin = userRoles?.some(role => role.role === 'admin');
    
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden - Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
    const lines = csvText.trim().split('\n');
    if (lines.length === 0) {
      return new Response(JSON.stringify({ error: 'Empty CSV file' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse header row
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    console.log('CSV headers:', headers);

    // Validate required headers
    const requiredHeaders = ['name'];
    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    
    if (missingHeaders.length > 0) {
      return new Response(JSON.stringify({ 
        error: `Missing required headers: ${missingHeaders.join(', ')}. Required: name. Optional: category, description` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse data rows
    const tags: TagRow[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Simple CSV parsing (handles quoted fields)
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
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

      // Create tag object
      const tag: TagRow = {
        name: '',
        category: 'general' // Default category
      };

      headers.forEach((header, index) => {
        const value = values[index]?.replace(/^"(.*)"$/, '$1') || '';
        
        switch (header) {
          case 'name':
            tag.name = value;
            break;
          case 'category':
            tag.category = value;
            break;
          case 'description':
            if (value) tag.description = value;
            break;
        }
      });

      // Validate tag
      if (!tag.name.trim()) {
        errors.push(`Row ${i + 1}: Missing tag name`);
        continue;
      }

      // Ensure category has a default value if empty
      if (!tag.category.trim()) {
        tag.category = 'general';
      }

      tags.push(tag);
    }

    console.log(`Parsed ${tags.length} tags with ${errors.length} errors`);

    if (tags.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No valid tags found in CSV',
        details: errors
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare tags for insertion
    const tagsToInsert = tags.map(tag => ({
      name: tag.name.trim(),
      slug: tag.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      category: tag.category.trim().toLowerCase().replace(/\s+/g, '-'),
      description: tag.description?.trim() || null
    }));

    console.log('Processing tags:', tagsToInsert.length);

    // Check for existing tags and split into new vs existing
    const existingSlugs = tagsToInsert.map(tag => tag.slug);
    const { data: existingTags } = await supabaseClient
      .from('unified_tags')
      .select('id, slug, name, category, description')
      .in('slug', existingSlugs);

    const existingTagsMap = new Map(existingTags?.map(tag => [tag.slug, tag]) || []);
    
    // Split tags into new and existing for updates
    const newTags = tagsToInsert.filter(tag => !existingTagsMap.has(tag.slug));
    const existingTagsToUpdate = tagsToInsert.filter(tag => existingTagsMap.has(tag.slug));

    console.log('New tags to insert:', newTags.length);
    console.log('Existing tags to update:', existingTagsToUpdate.length);

    let insertedTags = [];
    let updatedTags = [];
    let insertError = null;
    let updateError = null;

    // Insert new tags
    if (newTags.length > 0) {
      const result = await supabaseClient
        .from('unified_tags')
        .insert(newTags)
        .select();
      
      insertedTags = result.data || [];
      insertError = result.error;

      if (insertError) {
        console.error('Database insert error:', insertError);
        return new Response(JSON.stringify({ 
          error: 'Failed to import tags',
          details: insertError.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Update existing tags
    if (existingTagsToUpdate.length > 0) {
      for (const tag of existingTagsToUpdate) {
        const existingTag = existingTagsMap.get(tag.slug);
        if (existingTag) {
          const { data: updated, error: updateErr } = await supabaseClient
            .from('unified_tags')
            .update({
              name: tag.name,
              category: tag.category,
              description: tag.description
            })
            .eq('id', existingTag.id)
            .select();

          if (updateErr) {
            console.error('Update error for tag:', tag.name, updateErr);
            updateError = updateErr;
          } else if (updated) {
            updatedTags.push(...updated);
          }
        }
      }
    }

    const result = {
      success: true,
      imported: insertedTags?.length || 0,
      updated: updatedTags?.length || 0,
      total_parsed: tags.length,
      errors: errors.length > 0 ? errors : undefined
    };

    console.log('Import completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Import error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});