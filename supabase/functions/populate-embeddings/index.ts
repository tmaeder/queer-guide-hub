import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PopulateRequest {
  content_types?: string[];
  force_refresh?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content_types = ['venue', 'event', 'tag', 'group', 'marketplace'], force_refresh = false } = 
      await req.json() as PopulateRequest;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      console.log('OpenAI API key not found, will use fallback embeddings');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let totalProcessed = 0;
    let totalErrors = 0;
    let quotaExceeded = false;

    for (const contentType of content_types) {
      console.log(`Processing ${contentType} content...`);
      
      let data;
      
      // Fetch data based on content type
      switch (contentType) {
        case 'venue':
          const { data: venues } = await supabase
            .from('venues')
            .select('*')
            .limit(100);
          data = venues;
          break;
          
        case 'event':
          const { data: events } = await supabase
            .from('events')
            .select('*')
            .limit(100);
          data = events;
          break;
          
        case 'tag':
          const { data: tags } = await supabase
            .from('tags')
            .select('*')
            .limit(100);
          data = tags;
          break;
          
        case 'group':
          const { data: groups } = await supabase
            .from('community_groups')
            .select('*')
            .limit(100);
          data = groups;
          break;
          
        case 'marketplace':
          const { data: marketplace } = await supabase
            .from('marketplace_listings')
            .select('*')
            .limit(100);
          data = marketplace;
          break;
          
        default:
          console.log(`Unknown content type: ${contentType}`);
          continue;
      }

      if (!data || data.length === 0) {
        console.log(`Found 0 ${contentType} items`);
        continue;
      }

      console.log(`Found ${data.length} ${contentType} items`);

      // Process each item
      for (const item of data) {
        try {
          // Skip if embedding already exists and not force refresh
          if (!force_refresh) {
            const { data: existing } = await supabase
              .from('content_embeddings')
              .select('id')
              .eq('content_type', contentType)
              .eq('content_id', item.id)
              .maybeSingle();

            if (existing) {
              console.log(`Embedding already exists for ${contentType} ${item.id}, skipping`);
              continue;
            }
          }

          // Generate content text based on type
          let contentText = '';
          const metadata: any = {};

          switch (contentType) {
            case 'venue':
              contentText = [
                item.name,
                item.description,
                item.address,
                item.city,
                item.tags?.length ? `Tags: ${item.tags.join(', ')}` : ''
              ].filter(Boolean).join('. ');
              metadata.city = item.city;
              metadata.venue_type = item.venue_type;
              metadata.tags = item.tags || [];
              break;

            case 'event':
              contentText = [
                item.title,
                item.description,
                item.venue_name,
                item.city,
                item.event_type ? `Type: ${item.event_type}` : ''
              ].filter(Boolean).join('. ');
              metadata.event_type = item.event_type;
              metadata.city = item.city;
              break;

            case 'tag':
              contentText = [
                item.name,
                item.description,
                item.category ? `Category: ${item.category}` : ''
              ].filter(Boolean).join('. ');
              metadata.category = item.category;
              break;

            case 'group':
              contentText = [
                item.name,
                item.description,
                item.tags?.length ? `Tags: ${item.tags.join(', ')}` : ''
              ].filter(Boolean).join('. ');
              metadata.tags = item.tags || [];
              break;

            case 'marketplace':
              contentText = [
                item.title,
                item.description,
                item.condition ? `Condition: ${item.condition}` : ''
              ].filter(Boolean).join('. ');
              metadata.condition = item.condition;
              break;
          }

          if (!contentText.trim()) {
            console.log(`Skipping ${contentType} ${item.id} - no content text`);
            continue;
          }

          let embedding;

          // Try to generate embedding with OpenAI, fallback if quota exceeded
          if (openaiApiKey && !quotaExceeded) {
            try {
              const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${openaiApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'text-embedding-3-small',
                  input: contentText.trim(),
                }),
              });

              if (!embeddingResponse.ok) {
                const errorText = await embeddingResponse.text();
                console.error(`OpenAI API error for ${contentType} ${item.id}:`, errorText);
                
                // Check if quota exceeded
                if (embeddingResponse.status === 429 || errorText.includes('quota')) {
                  console.log('OpenAI quota exceeded, switching to fallback embeddings');
                  quotaExceeded = true;
                  embedding = generateFallbackEmbedding(contentText);
                } else {
                  throw new Error(`OpenAI API error: ${errorText}`);
                }
              } else {
                const embeddingData = await embeddingResponse.json();
                embedding = embeddingData.data[0].embedding;
              }
            } catch (error) {
              console.error(`Error calling OpenAI API:`, error);
              embedding = generateFallbackEmbedding(contentText);
              quotaExceeded = true;
            }
          } else {
            // Use fallback embedding
            embedding = generateFallbackEmbedding(contentText);
          }

          // Store embedding
          const { error: insertError } = await supabase
            .from('content_embeddings')
            .upsert({
              content_type: contentType,
              content_id: item.id,
              content_text: contentText.trim(),
              embedding,
              metadata
            }, {
              onConflict: 'content_type,content_id'
            });

          if (insertError) {
            console.error(`Error inserting embedding for ${contentType} ${item.id}:`, insertError);
            totalErrors++;
          } else {
            totalProcessed++;
            console.log(`Processed ${contentType} ${item.id}`);
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 50));

        } catch (itemError) {
          console.error(`Error processing ${contentType} ${item.id}:`, itemError);
          totalErrors++;
        }
      }
    }

    console.log(`Embedding population complete. Processed: ${totalProcessed}, Errors: ${totalErrors}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Embedding population complete. Processed: ${totalProcessed}, Errors: ${totalErrors}`,
        processed: totalProcessed,
        errors: totalErrors,
        quota_exceeded: quotaExceeded,
        fallback_used: quotaExceeded || !openaiApiKey
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in populate-embeddings function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});

// Generate a deterministic fallback embedding based on content
function generateFallbackEmbedding(contentText: string): number[] {
  const dimension = 1536; // Same as text-embedding-3-small
  const embedding = new Array(dimension);
  
  // Create a simple hash-based embedding
  let hash = 0;
  for (let i = 0; i < contentText.length; i++) {
    const char = contentText.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Generate embedding values based on content hash and position
  for (let i = 0; i < dimension; i++) {
    const seed = (hash + i) * 0.001;
    embedding[i] = Math.sin(seed) * 0.1; // Small values to simulate real embeddings
  }
  
  // Normalize the embedding
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimension; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}