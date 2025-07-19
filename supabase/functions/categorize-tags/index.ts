import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Predefined categories for LGBTQ+ community platform
const PREDEFINED_CATEGORIES = [
  'sexuality', 'gender-identity', 'health', 'relationships', 'community',
  'activism', 'support', 'lifestyle', 'events', 'venues', 'dating',
  'family', 'workplace', 'legal', 'education', 'arts', 'sports',
  'technology', 'travel', 'fashion', 'content'
];

interface TagData {
  id: string;
  name: string;
  category?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting tag categorization process...');

    // Fetch all tags that need categorization (uncategorized or general)
    const { data: tags, error: fetchError } = await supabase
      .from('unified_tags')
      .select('id, name, category')
      .or('category.is.null,category.eq.general');

    if (fetchError) {
      throw new Error(`Failed to fetch tags: ${fetchError.message}`);
    }

    if (!tags || tags.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No tags found that need categorization',
        categorized_count: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${tags.length} tags to categorize`);

    // Process tags in batches to avoid rate limits
    const BATCH_SIZE = 20; // Process 20 tags at a time
    const batches = [];
    for (let i = 0; i < tags.length; i += BATCH_SIZE) {
      batches.push(tags.slice(i, i + BATCH_SIZE));
    }

    console.log(`Processing ${batches.length} batches of ${BATCH_SIZE} tags each`);

    let totalCategorized = 0;
    const allCategorizations: Record<string, string> = {};

    // Process each batch with delays
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing batch ${batchIndex + 1}/${batches.length}`);

      try {
        // Prepare batch of tag names for AI categorization
        const tagNames = batch.map(tag => tag.name);
        const prompt = `
You are an AI assistant that categorizes LGBTQ+ community tags. Given a list of tag names, categorize each one into the most appropriate category from this list:

Categories: ${PREDEFINED_CATEGORIES.join(', ')}

Instructions:
- Assign exactly one category per tag
- Choose the most specific and appropriate category
- For identity-related terms (gay, lesbian, trans, etc.), use 'sexuality' or 'gender-identity'
- For medical/wellness terms, use 'health'
- For social connection terms, use 'community'
- For general content/topics, use 'content'
- If unsure, use the most general applicable category

Tag names to categorize:
${tagNames.join(', ')}

Return ONLY a JSON object with tag names as keys and categories as values. Example:
{
  "gay": "sexuality",
  "transgender": "gender-identity",
  "pride-parade": "events",
  "wellness": "health"
}
`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4.1-2025-04-14',
            messages: [
              { role: 'system', content: 'You are a helpful AI that categorizes LGBTQ+ community tags. Always respond with valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 1000,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            console.log(`Rate limit hit on batch ${batchIndex + 1}, waiting 60 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds
            // Retry this batch
            batchIndex--;
            continue;
          }
          throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const aiData = await response.json();
        const batchCategorizations = JSON.parse(aiData.choices[0].message.content);

        console.log(`Batch ${batchIndex + 1} categorizations:`, batchCategorizations);

        // Merge categorizations
        Object.assign(allCategorizations, batchCategorizations);

        // Update tags with new categories for this batch
        const updatePromises = [];
        for (const tag of batch) {
          const newCategory = batchCategorizations[tag.name];
          if (newCategory && PREDEFINED_CATEGORIES.includes(newCategory)) {
            console.log(`Updating tag "${tag.name}" to category "${newCategory}"`);
            
            const updatePromise = supabase
              .from('unified_tags')
              .update({ category: newCategory })
              .eq('id', tag.id);
            
            updatePromises.push(updatePromise);
            totalCategorized++;
          }
        }

        // Execute batch updates
        await Promise.allSettled(updatePromises);

        // Add delay between batches to respect rate limits
        if (batchIndex < batches.length - 1) {
          console.log('Waiting 2 seconds before next batch...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`Error processing batch ${batchIndex + 1}:`, error);
        // Continue with next batch rather than failing completely
      }
    }

    console.log(`Successfully categorized ${totalCategorized} tags across ${batches.length} batches`);

    return new Response(JSON.stringify({ 
      success: true, 
      categorized_count: totalCategorized,
      total_tags: tags.length,
      batches_processed: batches.length,
      categories_used: Object.values(allCategorizations),
      message: `Successfully categorized ${totalCategorized} out of ${tags.length} tags in ${batches.length} batches`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in categorize-tags function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});