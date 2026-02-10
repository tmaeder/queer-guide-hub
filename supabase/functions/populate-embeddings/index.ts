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
  limit?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      content_types = ['venue', 'event', 'tag', 'group', 'marketplace', 'personality', 'city', 'news'],
      force_refresh = false,
      limit = 100
    } = await req.json() as PopulateRequest;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      console.log('OpenAI API key not found, will use fallback embeddings');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let totalProcessed = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    let quotaExceeded = false;

    for (const contentType of content_types) {
      console.log(`Processing ${contentType} content...`);

      let data;

      switch (contentType) {
        case 'venue': {
          const { data: venues } = await supabase
            .from('venues')
            .select('id, name, description, address, city, country, venue_type, tags')
            .limit(limit);
          data = venues;
          break;
        }
        case 'event': {
          const { data: events } = await supabase
            .from('events')
            .select('id, title, description, venue_name, city, country, event_type')
            .limit(limit);
          data = events;
          break;
        }
        case 'tag': {
          const { data: tags } = await supabase
            .from('unified_tags')
            .select('id, name, description, category')
            .limit(limit);
          data = tags;
          break;
        }
        case 'group': {
          const { data: groups } = await supabase
            .from('community_groups')
            .select('id, name, description, tags')
            .limit(limit);
          data = groups;
          break;
        }
        case 'marketplace': {
          const { data: marketplace } = await supabase
            .from('marketplace_listings')
            .select('id, title, description, condition')
            .limit(limit);
          data = marketplace;
          break;
        }
        case 'personality': {
          const { data: personalities } = await supabase
            .from('personalities')
            .select('id, name, bio, nationality, birth_date, death_date, profession, lgbti_connection, tags')
            .limit(limit);
          data = personalities;
          break;
        }
        case 'city': {
          const { data: cities } = await supabase
            .from('cities')
            .select('id, name, description, country, population, lgbtq_friendliness_score, safety_score')
            .limit(limit);
          data = cities;
          break;
        }
        case 'news': {
          const { data: news } = await supabase
            .from('news_articles')
            .select('id, title, content, excerpt, author')
            .order('published_at', { ascending: false })
            .limit(limit);
          data = news;
          break;
        }
        default:
          console.log(`Unknown content type: ${contentType}`);
          continue;
      }

      if (!data || data.length === 0) {
        console.log(`Found 0 ${contentType} items`);
        continue;
      }

      console.log(`Found ${data.length} ${contentType} items`);

      const itemIds = data.map(item => item.id);
      let existingIds = new Set<string>();

      if (!force_refresh) {
        const { data: existing } = await supabase
          .from('content_embeddings')
          .select('content_id')
          .eq('content_type', contentType)
          .in('content_id', itemIds);

        if (existing) {
          existingIds = new Set(existing.map(e => e.content_id));
        }
      }

      for (const item of data) {
        try {
          if (!force_refresh && existingIds.has(item.id)) {
            totalSkipped++;
            continue;
          }

          let contentText = '';
          const metadata: any = {};

          switch (contentType) {
            case 'venue':
              contentText = [
                item.name, item.description, item.address, item.city, item.country,
                item.venue_type ? `Type: ${item.venue_type}` : '',
                item.tags?.length ? `Tags: ${item.tags.join(', ')}` : ''
              ].filter(Boolean).join('. ');
              metadata.city = item.city;
              metadata.venue_type = item.venue_type;
              metadata.tags = item.tags || [];
              break;
            case 'event':
              contentText = [
                item.title, item.description, item.venue_name, item.city,
                item.event_type ? `Type: ${item.event_type}` : ''
              ].filter(Boolean).join('. ');
              metadata.event_type = item.event_type;
              metadata.city = item.city;
              break;
            case 'tag':
              contentText = [
                item.name, item.description,
                item.category ? `Category: ${item.category}` : ''
              ].filter(Boolean).join('. ');
              metadata.category = item.category;
              break;
            case 'group':
              contentText = [
                item.name, item.description,
                item.tags?.length ? `Tags: ${item.tags.join(', ')}` : ''
              ].filter(Boolean).join('. ');
              metadata.tags = item.tags || [];
              break;
            case 'marketplace':
              contentText = [
                item.title, item.description,
                item.condition ? `Condition: ${item.condition}` : ''
              ].filter(Boolean).join('. ');
              metadata.condition = item.condition;
              break;
            case 'personality':
              contentText = [
                item.name, item.bio,
                item.nationality ? `Nationality: ${item.nationality}` : '',
                item.profession ? `Profession: ${item.profession}` : '',
                item.lgbti_connection ? `LGBTI connection: ${item.lgbti_connection}` : '',
                item.birth_date ? `Born: ${item.birth_date}` : '',
                item.death_date ? `Died: ${item.death_date}` : '',
                item.tags?.length ? `Tags: ${item.tags.join(', ')}` : ''
              ].filter(Boolean).join('. ');
              metadata.nationality = item.nationality;
              metadata.tags = item.tags || [];
              break;
            case 'city':
              contentText = [
                item.name, item.description,
                item.country ? `Country: ${item.country}` : '',
                item.population ? `Population: ${item.population}` : '',
                item.lgbtq_friendliness_score ? `LGBTQ+ friendliness: ${item.lgbtq_friendliness_score}/10` : '',
                item.safety_score ? `Safety score: ${item.safety_score}/10` : ''
              ].filter(Boolean).join('. ');
              metadata.country = item.country;
              metadata.lgbtq_friendliness_score = item.lgbtq_friendliness_score;
              break;
            case 'news':
              contentText = [
                item.title,
                item.excerpt || item.content?.substring(0, 500),
                item.author ? `By: ${item.author}` : ''
              ].filter(Boolean).join('. ');
              metadata.author = item.author;
              break;
          }

          if (!contentText.trim()) {
            console.log(`Skipping ${contentType} ${item.id} - no content text`);
            continue;
          }

          let embedding;

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
                  input: contentText.trim().substring(0, 8000),
                }),
              });

              if (!embeddingResponse.ok) {
                const errorText = await embeddingResponse.text();
                console.error(`OpenAI API error for ${contentType} ${item.id}:`, errorText);
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
            embedding = generateFallbackEmbedding(contentText);
          }

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
          }

          if (openaiApiKey && !quotaExceeded) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (itemError) {
          console.error(`Error processing ${contentType} ${item.id}:`, itemError);
          totalErrors++;
        }
      }
    }

    console.log(`Embedding population complete. Processed: ${totalProcessed}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Embedding population complete. Processed: ${totalProcessed}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`,
        processed: totalProcessed,
        skipped: totalSkipped,
        errors: totalErrors,
        quota_exceeded: quotaExceeded,
        fallback_used: quotaExceeded || !openaiApiKey
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in populate-embeddings function:', error);
    return new Response(
      JSON.stringify({ error: error.message, success: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function generateFallbackEmbedding(contentText: string): number[] {
  const dimension = 1536;
  const embedding = new Array(dimension);
  let hash = 0;
  for (let i = 0; i < contentText.length; i++) {
    const char = contentText.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  for (let i = 0; i < dimension; i++) {
    const seed = (hash + i) * 0.001;
    embedding[i] = Math.sin(seed) * 0.1;
  }
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimension; i++) {
      embedding[i] /= magnitude;
    }
  }
  return embedding;
}
