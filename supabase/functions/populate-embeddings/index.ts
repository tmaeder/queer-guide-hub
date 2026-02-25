import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { corsHeaders, requireAdmin, errorResponse } from '../_shared/supabase-client.ts';

const CF_ACCOUNT_ID = '7aa3765cc5f50f2b681b782eb4a8d296';
const CF_EMBEDDINGS_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1/embeddings`;
const CF_MODEL = '@cf/baai/bge-base-en-v1.5';
const EMBEDDING_DIMENSION = 768;
const BATCH_SIZE = 50; // CF supports up to 100, use 50 for safety

interface PopulateRequest {
  content_types?: string[];
  force_refresh?: boolean;
  limit?: number;
  offset?: number;
}

async function generateCFEmbeddings(texts: string[], cfApiToken: string): Promise<number[][]> {
  const response = await fetch(CF_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CF_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`CF Workers AI error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.data.map((item: any) => item.embedding);
}

function generateFallbackEmbedding(contentText: string): number[] {
  const embedding = new Array(EMBEDDING_DIMENSION);
  let hash = 0;
  for (let i = 0; i < contentText.length; i++) {
    const char = contentText.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    const seed = (hash + i) * 0.001;
    embedding[i] = Math.sin(seed) * 0.1;
  }
  const magnitude = Math.sqrt(embedding.reduce((sum: number, val: number) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      embedding[i] /= magnitude;
    }
  }
  return embedding;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      content_types = ['venue', 'event', 'tag', 'group', 'marketplace', 'personality', 'city', 'news'],
      force_refresh = false,
      limit: rawLimit = 100,
      offset: rawOffset = 0
    } = await req.json() as PopulateRequest;

    // Sanitize inputs
    const limit = Math.min(Math.max(1, rawLimit), 500);
    const offset = Math.max(0, rawOffset);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cfApiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');

    const supabaseForAuth = createClient(supabaseUrl, supabaseServiceKey);

    // Require admin authentication
    const authResult = await requireAdmin(req, supabaseForAuth);
    if (authResult instanceof Response) return authResult;

    if (!cfApiToken) {
      console.log('CLOUDFLARE_API_TOKEN not found, will use fallback embeddings');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let totalProcessed = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    let apiFailed = false;

    for (const contentType of content_types) {
      console.log(`Processing ${contentType} content...`);

      let data;

      switch (contentType) {
        case 'venue': {
          const { data: venues } = await supabase
            .from('venues')
            .select('id, name, description, address, city, country, category, tags')
            .range(offset, offset + limit - 1);
          data = venues;
          break;
        }
        case 'event': {
          const { data: events } = await supabase
            .from('events')
            .select('id, title, description, venue_name, city, country, event_type')
            .range(offset, offset + limit - 1);
          data = events;
          break;
        }
        case 'tag': {
          const { data: tags } = await supabase
            .from('unified_tags')
            .select('id, name, description, category')
            .eq('status', 'active')
            .range(offset, offset + limit - 1);
          data = tags;
          break;
        }
        case 'group': {
          const { data: groups } = await supabase
            .from('community_groups')
            .select('id, name, description, tags')
            .range(offset, offset + limit - 1);
          data = groups;
          break;
        }
        case 'marketplace': {
          const { data: marketplace } = await supabase
            .from('marketplace_listings')
            .select('id, title, description, category, price, location')
            .range(offset, offset + limit - 1);
          data = marketplace;
          break;
        }
        case 'personality': {
          const { data: personalities } = await supabase
            .from('personalities')
            .select('id, name, bio, nationality, birth_date, death_date, profession, lgbti_connection, tags')
            .range(offset, offset + limit - 1);
          data = personalities;
          break;
        }
        case 'city': {
          const { data: cities } = await supabase
            .from('cities')
            .select('id, name, description, country_id, population, lgbt_friendly_rating')
            .range(offset, offset + limit - 1);
          data = cities;
          break;
        }
        case 'news': {
          const { data: news } = await supabase
            .from('news_articles')
            .select('id, title, content, excerpt, author')
            .order('published_at', { ascending: false })
            .range(offset, offset + limit - 1);
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

      // Build content texts for items that need embedding (upsert handles dedup)
      const itemsToEmbed: { item: any; contentText: string; metadata: any }[] = [];

      for (const item of data) {

        let contentText = '';
        const metadata: any = {};

        switch (contentType) {
          case 'venue':
            contentText = [
              item.name, item.description, item.address, item.city, item.country,
              item.category ? `Category: ${item.category}` : '',
              item.tags?.length ? `Tags: ${item.tags.join(', ')}` : ''
            ].filter(Boolean).join('. ');
            metadata.city = item.city;
            metadata.category = item.category;
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
              item.category ? `Category: ${item.category}` : '',
              item.price ? `Price: ${item.price}` : '',
              item.location ? `Location: ${item.location}` : ''
            ].filter(Boolean).join('. ');
            metadata.category = item.category;
            metadata.location = item.location;
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
              item.country_id ? `Country ID: ${item.country_id}` : '',
              item.population ? `Population: ${item.population}` : '',
              item.lgbt_friendly_rating ? `LGBTQ+ friendliness: ${item.lgbt_friendly_rating}/10` : ''
            ].filter(Boolean).join('. ');
            metadata.country_id = item.country_id;
            metadata.lgbt_friendly_rating = item.lgbt_friendly_rating;
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

        itemsToEmbed.push({ item, contentText: contentText.trim().substring(0, 8000), metadata });
      }

      if (itemsToEmbed.length === 0) {
        console.log(`No new items to embed for ${contentType}`);
        continue;
      }

      console.log(`Embedding ${itemsToEmbed.length} ${contentType} items in batches of ${BATCH_SIZE}...`);

      // Process in batches
      for (let batchStart = 0; batchStart < itemsToEmbed.length; batchStart += BATCH_SIZE) {
        const batch = itemsToEmbed.slice(batchStart, batchStart + BATCH_SIZE);
        const texts = batch.map(b => b.contentText);

        let embeddings: number[][];

        if (cfApiToken && !apiFailed) {
          try {
            embeddings = await generateCFEmbeddings(texts, cfApiToken);
          } catch (error) {
            console.error(`CF API error on batch ${batchStart}:`, error);
            apiFailed = true;
            embeddings = texts.map(t => generateFallbackEmbedding(t));
          }
        } else {
          embeddings = texts.map(t => generateFallbackEmbedding(t));
        }

        // Upsert batch results
        const upsertRows = batch.map((b, i) => ({
          content_type: contentType,
          content_id: b.item.id,
          content_text: b.contentText,
          embedding: embeddings[i],
          metadata: b.metadata,
        }));

        const { error: upsertError } = await supabase
          .from('content_embeddings')
          .upsert(upsertRows, { onConflict: 'content_type,content_id' });

        if (upsertError) {
          console.error(`Batch upsert error for ${contentType}:`, upsertError);
          totalErrors += batch.length;
        } else {
          totalProcessed += batch.length;
          console.log(`  Batch ${batchStart}-${batchStart + batch.length}: ${batch.length} embedded`);
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
        api_failed: apiFailed,
        fallback_used: apiFailed || !cfApiToken,
        model: CF_MODEL,
        dimensions: EMBEDDING_DIMENSION,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in populate-embeddings function:', error);
    return errorResponse('Internal server error');
  }
});
