import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PopulateRequest {
  content_types?: string[];
  force_refresh?: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content_types = ['venue', 'event', 'tag', 'group', 'marketplace'], force_refresh = false }: PopulateRequest = await req.json();

    console.log('Starting content embedding population for:', content_types);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let totalProcessed = 0;
    let totalErrors = 0;

    // Process each content type
    for (const contentType of content_types) {
      console.log(`Processing ${contentType} content...`);

      try {
        let content: any[] = [];

        // Fetch content based on type
        switch (contentType) {
          case 'venue':
            const { data: venues } = await supabase
              .from('venues')
              .select('id, name, description, type, address, city, tags, accessibility_features')
              .limit(100);
            content = venues || [];
            break;

          case 'event':
            const { data: events } = await supabase
              .from('events')
              .select('id, title, description, event_type, city, venue_name, tags, target_groups')
              .limit(100);
            content = events || [];
            break;

          case 'tag':
            const { data: tags } = await supabase
              .from('unified_tags')
              .select('id, name, description, category')
              .limit(200);
            content = tags || [];
            break;

          case 'group':
            const { data: groups } = await supabase
              .from('community_groups')
              .select('id, name, description, tags')
              .limit(100);
            content = groups || [];
            break;

          case 'marketplace':
            const { data: listings } = await supabase
              .from('marketplace_listings')
              .select('id, title, description, condition, tags')
              .limit(100);
            content = listings || [];
            break;
        }

        console.log(`Found ${content.length} ${contentType} items`);

        // Process each item
        for (const item of content) {
          try {
            // Check if embedding already exists
            if (!force_refresh) {
              const { data: existing } = await supabase
                .from('content_embeddings')
                .select('id')
                .eq('content_type', contentType)
                .eq('content_id', item.id)
                .single();

              if (existing) {
                console.log(`Skipping existing embedding for ${contentType} ${item.id}`);
                continue;
              }
            }

            // Create searchable text content
            let contentText = '';
            const metadata: any = { content_type: contentType };

            switch (contentType) {
              case 'venue':
                contentText = [
                  item.name,
                  item.description,
                  `Type: ${item.type}`,
                  item.address ? `Address: ${item.address}` : '',
                  item.city ? `City: ${item.city}` : '',
                  item.tags?.length ? `Tags: ${item.tags.join(', ')}` : '',
                  item.accessibility_features?.length ? `Accessibility: ${item.accessibility_features.join(', ')}` : ''
                ].filter(Boolean).join('. ');
                metadata.venue_type = item.type;
                metadata.city = item.city;
                metadata.tags = item.tags || [];
                break;

              case 'event':
                contentText = [
                  item.title,
                  item.description,
                  `Event type: ${item.event_type}`,
                  item.city ? `City: ${item.city}` : '',
                  item.venue_name ? `Venue: ${item.venue_name}` : '',
                  item.tags?.length ? `Tags: ${item.tags.join(', ')}` : '',
                  item.target_groups?.length ? `Target groups: ${item.target_groups.join(', ')}` : ''
                ].filter(Boolean).join('. ');
                metadata.event_type = item.event_type;
                metadata.city = item.city;
                metadata.tags = item.tags || [];
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
                  item.condition ? `Condition: ${item.condition}` : '',
                  item.tags?.length ? `Tags: ${item.tags.join(', ')}` : ''
                ].filter(Boolean).join('. ');
                metadata.condition = item.condition;
                metadata.tags = item.tags || [];
                break;
            }

            if (!contentText.trim()) {
              console.log(`Skipping ${contentType} ${item.id} - no content text`);
              continue;
            }

            // Generate embedding
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
              throw new Error(`OpenAI API error: ${await embeddingResponse.text()}`);
            }

            const embeddingData = await embeddingResponse.json();
            const embedding = embeddingData.data[0].embedding;

            // Store embedding
            await supabase
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

            totalProcessed++;
            console.log(`Processed ${contentType} ${item.id}`);

            // Rate limiting to avoid hitting API limits
            await new Promise(resolve => setTimeout(resolve, 100));

          } catch (itemError) {
            console.error(`Error processing ${contentType} ${item.id}:`, itemError);
            totalErrors++;
          }
        }

      } catch (contentTypeError) {
        console.error(`Error processing ${contentType}:`, contentTypeError);
        totalErrors++;
      }
    }

    console.log(`Embedding population complete. Processed: ${totalProcessed}, Errors: ${totalErrors}`);

    return new Response(
      JSON.stringify({
        success: true,
        total_processed: totalProcessed,
        total_errors: totalErrors,
        content_types_processed: content_types
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Population function error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});