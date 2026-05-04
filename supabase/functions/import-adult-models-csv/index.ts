import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, getServiceClient, requireAdmin } from '../_shared/supabase-client.ts';

interface AdultModelRow {
  'pornhub-profile': string;
  picture: string;
  name: string;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

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
    const supabase = getServiceClient();

    // Require admin access
    const auth = await requireAdmin(req, supabase);
    if (auth instanceof Response) return auth;

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

        const row: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          row[header] = values[index]?.replace(/"/g, '') || '';
        });

        rows.push(row as AdultModelRow);
      } catch (error) {
        errors.push(`Row ${i + 1}: Failed to parse - ${error.message}`);
      }
    }

    console.log(`Parsed ${rows.length} rows from CSV`);

    // Validate and prepare personalities data with image downloads
    const personalitiesData = [];
    const BATCH_SIZE = 3; // Small batch size to avoid timeout
    
    // Process rows in small batches to avoid timeout
    for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
      const batch = rows.slice(batchStart, batchStart + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)} (${batch.length} items)`);
      
      // Process batch items in parallel but with timeout control
      const batchPromises = batch.map(async (row, batchIndex) => {
        const rowIndex = batchStart + batchIndex;
        
        // Validate required fields
        if (!row.name || row.name.trim() === '') {
          errors.push(`Row ${rowIndex + 2}: Name is required`);
          return null;
        }

        let imageUrl = null;
        
        // Download and upload image if URL provided
        if (row.picture && row.picture.trim() !== '') {
          try {
            console.log(`Downloading image for ${row.name}: ${row.picture}`);
            
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout per image
            
            const imageResponse = await fetch(row.picture, {
              signal: controller.signal,
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; QueerGuide/1.0)'
              }
            });
            
            clearTimeout(timeoutId);
            
            if (imageResponse.ok) {
              const imageBlob = await imageResponse.blob();
              const fileExtension = imageResponse.headers.get('content-type')?.split('/')[1] || 'jpg';
              const fileName = `${row.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${fileExtension}`;
              
              // Upload to Supabase storage
              const { data: _uploadData, error: uploadError } = await supabase.storage
                .from('adult-model-images')
                .upload(fileName, imageBlob, {
                  contentType: imageResponse.headers.get('content-type') || 'image/jpeg',
                  upsert: false
                });
              
              if (uploadError) {
                console.error(`Failed to upload image for ${row.name}:`, uploadError);
                errors.push(`Row ${rowIndex + 2}: Failed to upload image - ${uploadError.message}`);
              } else {
                // Get public URL
                const { data: { publicUrl } } = supabase.storage
                  .from('adult-model-images')
                  .getPublicUrl(fileName);
                
                imageUrl = publicUrl;
                console.log(`Successfully uploaded image for ${row.name}: ${imageUrl}`);
              }
            } else {
              console.error(`Failed to download image for ${row.name}: ${imageResponse.status}`);
              errors.push(`Row ${rowIndex + 2}: Failed to download image from ${row.picture} (Status: ${imageResponse.status})`);
            }
          } catch (error) {
            console.error(`Error processing image for ${row.name}:`, error);
            if (error instanceof Error && error.name === 'AbortError') {
              errors.push(`Row ${rowIndex + 2}: Image download timeout`);
            } else {
              errors.push(`Row ${rowIndex + 2}: Error processing image - ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        }

        const personalityData = {
          name: row.name.trim(),
          profession: 'adult model',
          bio: null,
          birth_date: null,
          death_date: null,
          nationality: null,
          birth_place: null,
          image_url: imageUrl,
          verification_status: 'pending',
          is_featured: false,
          is_living: true,
          is_adult: true,
          fields: row['pornhub-profile'] && row['pornhub-profile'].trim() !== '' 
            ? { pornhub_profile: row['pornhub-profile'].trim() }
            : null,
          view_count: 0,
          created_by: auth.userId
        };

        return personalityData;
      });

      // Wait for batch to complete
      try {
        const batchResults = await Promise.allSettled(batchPromises);
        batchResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            personalitiesData.push(result.value);
          }
        });
      } catch (batchError) {
        console.error('Batch processing error:', batchError);
        errors.push(`Batch processing error: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`);
      }
      
      // Small delay between batches to prevent overwhelming the server
      if (batchStart + BATCH_SIZE < rows.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
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
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});