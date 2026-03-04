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

// Enhanced categories for tag wiki with more granular classification
const TAG_CATEGORIES = {
  // Identity & Orientation
  'gender-identity': 'Gender Identity',
  'sexual-orientation': 'Sexual Orientation', 
  'romantic-orientation': 'Romantic Orientation',
  'expression': 'Expression & Presentation',
  
  // Relationships & Dynamics
  'relationship-structure': 'Relationship Structure',
  'relationship-roles': 'Relationship Roles',
  'power-dynamics': 'Power Dynamics',
  'communication': 'Communication & Consent',
  
  // Activities & Practices
  'intimacy': 'Intimacy & Connection',
  'kink-practice': 'Kink & BDSM Practice',
  'sexual-activity': 'Sexual Activity',
  'roleplay': 'Roleplay & Fantasy',
  
  // Equipment & Tools
  'toys-accessories': 'Toys & Accessories',
  'equipment': 'Equipment & Gear',
  'clothing-fashion': 'Clothing & Fashion',
  
  // Community & Culture
  'community-terms': 'Community Terms',
  'subculture': 'Subculture & Scene',
  'events-gatherings': 'Events & Gatherings',
  'celebrations': 'Celebrations & Holidays',
  
  // Health & Safety
  'physical-health': 'Physical Health',
  'mental-wellness': 'Mental Wellness',
  'safety-practices': 'Safety & Risk Awareness',
  'support-resources': 'Support & Resources',
  
  // Spaces & Environments
  'venues': 'Venues & Locations',
  'online-spaces': 'Online Spaces',
  'private-spaces': 'Private Spaces',
  
  // Interests & Preferences
  'attraction-type': 'Attraction & Preference',
  'lifestyle': 'Lifestyle & Living',
  'hobbies-interests': 'Hobbies & Interests',
  'body-modification': 'Body Modification',
  
  // General
  'educational': 'Educational & Informational',
  'advocacy': 'Advocacy & Activism',
  'general': 'General'
};

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

    // Get all tag categories first
    const { data: categories, error: categoriesError } = await supabase
      .from('tag_categories')
      .select('*')
      .order('sort_order');

    if (categoriesError) {
      throw new Error(`Failed to fetch categories: ${categoriesError.message}`);
    }

    // Create category slug to ID mapping
    const categoryMap = new Map(categories.map(cat => [cat.slug, cat.id]));

    // Fetch all tags that need categorization (no category_id)
    const { data: tags, error: fetchError } = await supabase
      .from('unified_tags')
      .select('id, name, category_id')
      .is('category_id', null);

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
You are an expert AI categorization system for an inclusive LGBTQ+ community platform that encompasses all aspects of queer identity, relationships, and culture. Your task is to categorize tags with precision and cultural sensitivity.

Available Categories and Detailed Descriptions:

IDENTITY & ORIENTATION:
- gender-identity: Trans, non-binary, genderfluid, agender, demigender, etc.
- sexual-orientation: Gay, lesbian, bisexual, pansexual, asexual, demisexual, etc.
- romantic-orientation: Aromantic, demiromantic, biromantic, etc.
- expression: Drag, butch, femme, androgynous, gender presentation styles

RELATIONSHIPS & DYNAMICS:
- relationship-structure: Polyamory, monogamy, relationship anarchy, open relationships
- relationship-roles: Top, bottom, versatile, Dom, sub, switch, caregiver
- power-dynamics: BDSM dynamics, D/s, M/s, ownership, protocol
- communication: Consent, negotiation, boundaries, safe words, aftercare

ACTIVITIES & PRACTICES:
- intimacy: Romantic connection, emotional bonding, sensual activities
- kink-practice: BDSM scenes, kink activities, fetish practices, protocols
- sexual-activity: Sexual acts, techniques, positions, pleasure practices
- roleplay: Fantasy scenarios, character play, age play, pet play

EQUIPMENT & TOOLS:
- toys-accessories: Sex toys, vibrators, dildos, plugs, intimate accessories
- equipment: BDSM gear, restraints, impact toys, furniture, tools
- clothing-fashion: Leather, latex, fetish wear, pride clothing, accessories

COMMUNITY & CULTURE:
- community-terms: Queer slang, community-specific language, cultural terms
- subculture: Bear, twink, leather, puppy, specific scene identities
- events-gatherings: Pride, munches, play parties, conventions, meetups
- celebrations: Pride month, holidays, commemorative events

HEALTH & SAFETY:
- physical-health: Sexual health, STI testing, PrEP, sexual wellness
- mental-wellness: Therapy, support, self-care, mental health resources
- safety-practices: Risk awareness, safe sex, RACK, SSC, scene safety
- support-resources: Hotlines, counseling, crisis support, community aid

SPACES & ENVIRONMENTS:
- venues: Clubs, bars, dungeons, play spaces, community centers
- online-spaces: Apps, websites, forums, virtual communities
- private-spaces: Home setups, private play areas, personal spaces

INTERESTS & PREFERENCES:
- attraction-type: Physical preferences, attraction patterns, compatibility
- lifestyle: Living arrangements, daily practices, relationship styles
- hobbies-interests: Non-sexual interests, activities, passions
- body-modification: Tattoos, piercings, body art, modifications

GENERAL:
- educational: Learning resources, guides, educational content
- advocacy: Activism, rights, political action, social justice
- general: Miscellaneous terms that don't fit specific categories

Categorization Rules:
1. Choose the MOST SPECIFIC applicable category
2. Consider context and nuance of LGBTQ+ and kink communities
3. Be sensitive to identity terms vs. activity terms
4. If a tag could fit multiple categories, prioritize: Identity > Practice > Equipment > General
5. Use "general" only as a last resort

Tags to categorize: ${tagNames.join(', ')}

Return ONLY valid JSON with tag names as keys and category slugs as values:
{
  "transgender": "gender-identity",
  "polyamory": "relationship-structure", 
  "bondage": "kink-practice",
  "vibrator": "toys-accessories",
  "bear": "subculture"
}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini', // Updated to newer model
            messages: [
              { role: 'system', content: 'You are an expert AI categorization system for an inclusive LGBTQ+ community platform. Always respond with valid JSON only.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 1500,
            store: false,
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
          const newCategorySlug = batchCategorizations[tag.name];
          if (newCategorySlug && Object.keys(TAG_CATEGORIES).includes(newCategorySlug)) {
            const categoryId = categoryMap.get(newCategorySlug);
            if (categoryId) {
              console.log(`Updating tag "${tag.name}" to category "${newCategorySlug}" (ID: ${categoryId})`);
              
              const updatePromise = supabase
                .from('unified_tags')
                .update({ category_id: categoryId })
                .eq('id', tag.id);
              
              updatePromises.push(updatePromise);
              totalCategorized++;
            }
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