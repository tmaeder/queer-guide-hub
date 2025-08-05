import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, session_id, content_types = [], limit = 5 }: RAGRequest = await req.json();

    if (!query?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing RAG query:', query);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Generate embedding for the query
    console.log('Generating query embedding...');
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query.trim(),
      }),
    });

    if (!embeddingResponse.ok) {
      const error = await embeddingResponse.text();
      console.error('OpenAI embedding error:', error);
      throw new Error(`Failed to generate embedding: ${error}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;
    console.log('Query embedding generated successfully');

    // Step 2: Search for similar content using vector similarity
    console.log('Searching for similar content...');
    let similarityQuery = supabase
      .rpc('match_content_embeddings', {
        query_embedding: queryEmbedding,
        similarity_threshold: 0.1,
        match_count: limit
      });

    // Filter by content types if specified
    if (content_types.length > 0) {
      similarityQuery = similarityQuery.in('content_type', content_types);
    }

    const { data: similarContent, error: searchError } = await similarityQuery;

    if (searchError) {
      console.error('Similarity search error:', searchError);
      // Fallback to regular text search if vector search fails
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
          
          // Fetch additional details based on content type
          switch (item.content_type) {
            case 'venue':
              const { data: venue } = await supabase
                .from('venues')
                .select('name, type, city, rating, tags, accessibility_features')
                .eq('id', item.content_id)
                .single();
              additionalData = { venue_details: venue };
              break;
              
            case 'event':
              const { data: event } = await supabase
                .from('events')
                .select('title, event_type, city, start_date, venue_name, tags')
                .eq('id', item.content_id)
                .single();
              additionalData = { event_details: event };
              break;
              
            case 'tag':
              const { data: tag } = await supabase
                .from('unified_tags')
                .select('name, description, category, color, usage_count')
                .eq('id', item.content_id)
                .single();
              additionalData = { tag_details: tag };
              break;
              
            case 'group':
              const { data: group } = await supabase
                .from('community_groups')
                .select('name, description, member_count, tags, is_private')
                .eq('id', item.content_id)
                .single();
              additionalData = { group_details: group };
              break;
              
            case 'marketplace':
              const { data: listing } = await supabase
                .from('marketplace_listings')
                .select('title, description, price, condition, tags')
                .eq('id', item.content_id)
                .single();
              additionalData = { listing_details: listing };
              break;
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

    // Step 4: Generate AI response using the context
    console.log('Generating AI response...');
    const contextText = enhancedContent
      .map((item: any) => {
        const details = item.venue_details || item.event_details || item.tag_details || 
                       item.group_details || item.listing_details || {};
        return `[${item.content_type.toUpperCase()}] ${item.content_text}\nAdditional Info: ${JSON.stringify(details)}`;
      })
      .join('\n\n');

    const systemPrompt = `You are a helpful assistant for the Queer Guide platform, a comprehensive directory for LGBTQ+ venues, events, groups, tags, and marketplace items. Use the provided context to answer user questions accurately and helpfully.

Context includes venues (bars, cafés, organizations), events (pride, social gatherings), tags (descriptive labels), community groups, and marketplace listings.

Guidelines:
- Be inclusive and supportive
- Provide specific details when available
- Suggest related content when relevant
- Use warm, welcoming language
- If context is limited, acknowledge this clearly
- Focus on practical, actionable information

Current Context:
${contextText}`;

    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
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
      console.error('OpenAI chat error:', error);
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
        // Continue without saving - non-critical
      }
    }

    // Return response with context information
    return new Response(
      JSON.stringify({
        response: aiResponse,
        context: enhancedContent,
        sources_count: enhancedContent.length,
        session_id: session_id || crypto.randomUUID()
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