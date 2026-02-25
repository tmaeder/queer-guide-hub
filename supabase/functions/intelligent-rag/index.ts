import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CF_ACCOUNT_ID = '7aa3765cc5f50f2b681b782eb4a8d296';
const CF_EMBEDDINGS_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1/embeddings`;
const CF_CHAT_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/v1/chat/completions`;
const CF_EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';
const CF_CHAT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

interface ContentItem {
  id: string;
  content_type: string;
  content_text: string;
  metadata: any;
  similarity?: number;
}

interface RAGRequest {
  query: string;
  session_id?: string;
  content_types?: string[];
  limit?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query: rawQuery, session_id, content_types = [], limit: rawLimit = 5 }: RAGRequest = await req.json();

    if (!rawQuery?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Sanitize query — limit length and cap result limit
    const query = rawQuery.trim().slice(0, 500);
    const limit = Math.min(Math.max(1, rawLimit), 20);

    console.log('Processing RAG query:', query.slice(0, 100));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cfApiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');

    if (!cfApiToken) {
      throw new Error('CLOUDFLARE_API_TOKEN not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Generate embedding for the query via CF Workers AI
    console.log('Generating query embedding via CF Workers AI...');
    const embeddingResponse = await fetch(CF_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CF_EMBEDDING_MODEL,
        input: [query.trim()],
      }),
    });

    if (!embeddingResponse.ok) {
      const error = await embeddingResponse.text();
      console.error('CF embedding error:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;
    console.log(`Query embedding generated (${queryEmbedding.length} dims)`);

    // Step 2: Search for similar content using vector similarity
    console.log('Searching for similar content...');
    let similarityQuery = supabase
      .rpc('match_content_embeddings', {
        query_embedding: queryEmbedding,
        similarity_threshold: 0.1,
        match_count: limit
      });

    if (content_types.length > 0) {
      similarityQuery = similarityQuery.in('content_type', content_types);
    }

    const { data: vectorResults, error: searchError } = await similarityQuery;

    let similarContent = vectorResults;

    if (searchError) {
      console.error('Similarity search error:', searchError);
      console.log('Falling back to text search...');

      let textQuery = supabase
        .from('content_embeddings')
        .select('content_id, content_type, content_text, metadata')
        .textSearch('content_text', query.trim().replace(/\s+/g, ' & '))
        .limit(limit);

      if (content_types.length > 0) {
        textQuery = textQuery.in('content_type', content_types);
      }

      const { data: textResults, error: textError } = await textQuery;

      if (textError) {
        console.error('Text search error:', textError);
        throw new Error('Search failed');
      }

      similarContent = textResults?.map(item => ({ ...item, similarity: 0.5 })) || [];
    }

    console.log(`Found ${similarContent?.length || 0} similar content items`);

    // Step 3: Enhance content with additional context
    const enhancedContent = await Promise.all(
      (similarContent || []).map(async (item: ContentItem) => {
        try {
          let additionalData = {};

          switch (item.content_type) {
            case 'venue': {
              const { data: venue } = await supabase
                .from('venues')
                .select('name, type, city, foursquare_rating, tags, accessibility_features')
                .eq('id', item.content_id)
                .single();
              additionalData = { venue_details: venue };
              break;
            }
            case 'event': {
              const { data: event } = await supabase
                .from('events')
                .select('title, event_type, city, start_date, venue_name, tags')
                .eq('id', item.content_id)
                .single();
              additionalData = { event_details: event };
              break;
            }
            case 'tag': {
              const { data: tag } = await supabase
                .from('unified_tags')
                .select('name, description, category_id, color, usage_count')
                .eq('id', item.content_id)
                .single();
              additionalData = { tag_details: tag };
              break;
            }
            case 'group': {
              const { data: group } = await supabase
                .from('community_groups')
                .select('name, description, member_count, tags, is_private')
                .eq('id', item.content_id)
                .single();
              additionalData = { group_details: group };
              break;
            }
            case 'marketplace': {
              const { data: listing } = await supabase
                .from('marketplace_listings')
                .select('title, description, price, condition, tags')
                .eq('id', item.content_id)
                .single();
              additionalData = { listing_details: listing };
              break;
            }
            case 'personality': {
              const { data: person } = await supabase
                .from('personalities')
                .select('name, profession, nationality, lgbti_connection')
                .eq('id', item.content_id)
                .single();
              additionalData = { personality_details: person };
              break;
            }
            case 'city': {
              const { data: city } = await supabase
                .from('cities')
                .select('name, description, lgbt_friendly_rating')
                .eq('id', item.content_id)
                .single();
              additionalData = { city_details: city };
              break;
            }
            case 'news': {
              const { data: article } = await supabase
                .from('news_articles')
                .select('title, excerpt, source_name')
                .eq('id', item.content_id)
                .single();
              additionalData = { news_details: article };
              break;
            }
          }

          return {
            ...item,
            ...additionalData
          };
        } catch (error) {
          console.error(`Error enhancing ${item.content_type}:`, error);
          return item;
        }
      })
    );

    // Step 4: Generate AI response via CF Workers AI (Llama 3.3)
    console.log('Generating AI response via CF Workers AI...');
    const contextText = enhancedContent
      .map((item: any) => {
        const details = item.venue_details || item.event_details || item.tag_details ||
                       item.group_details || item.listing_details || item.personality_details ||
                       item.city_details || item.news_details || {};
        return `[${item.content_type.toUpperCase()}] ${item.content_text}\nAdditional Info: ${JSON.stringify(details)}`;
      })
      .join('\n\n');

    const systemPrompt = `You are a helpful assistant for the Queer Guide platform, a comprehensive directory for LGBTQ+ venues, events, groups, tags, and marketplace items. Use the provided context to answer user questions accurately and helpfully.

Context includes venues (bars, cafés, organizations), events (pride, social gatherings), tags (descriptive labels), community groups, marketplace listings, personalities, cities, and news articles.

Guidelines:
- Be inclusive and supportive
- Provide specific details when available
- Suggest related content when relevant
- Use warm, welcoming language
- If context is limited, acknowledge this clearly
- Focus on practical, actionable information

Current Context:
${contextText}`;

    const chatResponse = await fetch(CF_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CF_CHAT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!chatResponse.ok) {
      const error = await chatResponse.text();
      console.error('CF chat error:', error);
      throw new Error(`Failed to generate response: ${error}`);
    }

    const chatData = await chatResponse.json();
    const aiResponse = chatData.choices[0].message.content;
    console.log('AI response generated successfully');

    // Step 5: Save conversation to database (if user is authenticated)
    const authHeader = req.headers.get('authorization');
    if (authHeader && session_id) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);

        if (user) {
          await supabase
            .from('rag_conversations')
            .insert({
              user_id: user.id,
              session_id: session_id || crypto.randomUUID(),
              query,
              response: aiResponse,
              context_used: enhancedContent,
              embedding: queryEmbedding
            });
        }
      } catch (error) {
        console.error('Error saving conversation:', error);
      }
    }

    return new Response(
      JSON.stringify({
        response: aiResponse,
        context: enhancedContent,
        sources_count: enhancedContent.length,
        session_id: session_id || crypto.randomUUID(),
        model: CF_CHAT_MODEL,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('RAG function error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
