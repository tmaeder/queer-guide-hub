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

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  level: number;
  parent_id: string | null;
  description: string | null;
}

/**
 * Build the AI prompt's category list dynamically from the DB rows.
 * Groups subcategories under their parent for clarity.
 */
function buildCategoryPromptSection(categories: CategoryRow[]): string {
  const parents = categories.filter(c => c.level === 0 || !c.parent_id);
  const childrenByParent = new Map<string, CategoryRow[]>();

  for (const cat of categories) {
    if (cat.parent_id) {
      if (!childrenByParent.has(cat.parent_id)) {
        childrenByParent.set(cat.parent_id, []);
      }
      childrenByParent.get(cat.parent_id)!.push(cat);
    }
  }

  const lines: string[] = [];
  for (const parent of parents) {
    const children = childrenByParent.get(parent.id) || [];
    lines.push(`\n${parent.name.toUpperCase()}:`);
    if (children.length > 0) {
      for (const child of children) {
        const desc = child.description ? `: ${child.description}` : '';
        lines.push(`- ${child.slug}${desc}`);
      }
    } else {
      const desc = parent.description ? `: ${parent.description}` : '';
      lines.push(`- ${parent.slug}${desc}`);
    }
  }

  return lines.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse optional body params
    let recategorize = false;
    let batchSize = 20;
    try {
      const body = await req.json();
      recategorize = body?.recategorize === true;
      if (body?.batch_size && typeof body.batch_size === 'number') {
        batchSize = Math.min(Math.max(5, body.batch_size), 50);
      }
    } catch {
      // No body or invalid JSON — use defaults
    }

    console.log(`Starting tag categorization (recategorize=${recategorize}, batch_size=${batchSize})...`);

    // Load categories dynamically from the DB
    const { data: categories, error: categoriesError } = await supabase
      .from('tag_categories')
      .select('id, slug, name, level, parent_id, description')
      .order('sort_order');

    if (categoriesError) {
      throw new Error(`Failed to fetch categories: ${categoriesError.message}`);
    }

    if (!categories || categories.length === 0) {
      throw new Error('No tag categories found in the database');
    }

    // Build lookup maps
    const slugToId = new Map<string, string>(categories.map(c => [c.slug, c.id]));
    const validSlugs = new Set(categories.map(c => c.slug));

    // Build the category prompt section from DB data
    const categoryPromptSection = buildCategoryPromptSection(categories as CategoryRow[]);
    const allSlugs = categories.map(c => c.slug).join(', ');

    // Fetch tags to categorize
    let tagsQuery = supabase
      .from('unified_tags')
      .select('id, name, category_id')
      .eq('status', 'active');

    if (!recategorize) {
      // Only uncategorized tags (no category_id AND no assignments)
      tagsQuery = tagsQuery.is('category_id', null);
    }

    const { data: tags, error: fetchError } = await tagsQuery;

    if (fetchError) {
      throw new Error(`Failed to fetch tags: ${fetchError.message}`);
    }

    // When not recategorizing, also filter out tags that already have assignments
    let tagsToProcess = tags || [];
    if (!recategorize && tagsToProcess.length > 0) {
      const tagIds = tagsToProcess.map(t => t.id);
      const { data: existingAssignments } = await supabase
        .from('tag_category_assignments')
        .select('tag_id')
        .in('tag_id', tagIds);

      const assignedIds = new Set((existingAssignments || []).map(a => a.tag_id));
      tagsToProcess = tagsToProcess.filter(t => !assignedIds.has(t.id));
    }

    if (tagsToProcess.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No tags found that need categorization',
        categorized_count: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${tagsToProcess.length} tags to categorize`);

    // Process in batches
    const batches: typeof tagsToProcess[] = [];
    for (let i = 0; i < tagsToProcess.length; i += batchSize) {
      batches.push(tagsToProcess.slice(i, i + batchSize));
    }

    console.log(`Processing ${batches.length} batches of up to ${batchSize} tags each`);

    let totalCategorized = 0;
    let totalAssignments = 0;
    const allCategorizations: Record<string, string> = {};

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`Processing batch ${batchIndex + 1}/${batches.length}`);

      try {
        const tagNames = batch.map(tag => tag.name);
        const prompt = `You are an expert AI categorization system for an inclusive LGBTQ+ community platform. Categorize each tag into the MOST SPECIFIC applicable category.

Available Categories (use the slug values):
${categoryPromptSection}

Valid slugs: ${allSlugs}

Rules:
1. Choose the MOST SPECIFIC applicable category slug
2. Consider LGBTQ+ and kink community context and nuance
3. Prioritize: Identity > Practice > Community > General
4. Only use a parent-level slug if no subcategory fits
5. Return ONLY valid slugs from the list above

Tags to categorize: ${tagNames.join(', ')}

Return ONLY valid JSON — tag names as keys, category slugs as values:
{"example-tag": "category-slug"}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are an expert AI categorization system for an inclusive LGBTQ+ community platform. Always respond with valid JSON only, no markdown fences.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 2000,
          }),
        });

        if (!response.ok) {
          if (response.status === 429) {
            console.log(`Rate limit hit on batch ${batchIndex + 1}, waiting 60 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 60000));
            batchIndex--;
            continue;
          }
          throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const aiData = await response.json();
        const rawContent = aiData.choices[0].message.content
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        const batchCategorizations: Record<string, string> = JSON.parse(rawContent);

        console.log(`Batch ${batchIndex + 1} categorizations:`, batchCategorizations);
        Object.assign(allCategorizations, batchCategorizations);

        // Process each tag: update category_id AND upsert tag_category_assignments
        for (const tag of batch) {
          const categorySlug = batchCategorizations[tag.name];
          if (!categorySlug || !validSlugs.has(categorySlug)) {
            console.warn(`Skipping tag "${tag.name}" — invalid slug "${categorySlug}"`);
            continue;
          }

          const categoryId = slugToId.get(categorySlug)!;

          // 1. Update unified_tags.category_id for backwards compatibility
          const { error: updateError } = await supabase
            .from('unified_tags')
            .update({ category_id: categoryId })
            .eq('id', tag.id);

          if (updateError) {
            console.error(`Failed to update category_id for "${tag.name}":`, updateError.message);
            continue;
          }

          // 2. Upsert into tag_category_assignments with is_primary = true
          if (recategorize) {
            // Remove existing primary assignment before re-assigning
            await supabase
              .from('tag_category_assignments')
              .delete()
              .eq('tag_id', tag.id)
              .eq('is_primary', true);
          }

          const { error: assignError } = await supabase
            .from('tag_category_assignments')
            .upsert(
              { tag_id: tag.id, category_id: categoryId, is_primary: true },
              { onConflict: 'tag_id,category_id' }
            );

          if (assignError) {
            console.error(`Failed to create assignment for "${tag.name}":`, assignError.message);
          } else {
            totalAssignments++;
          }

          totalCategorized++;
        }

        // Rate limit delay between batches
        if (batchIndex < batches.length - 1) {
          console.log('Waiting 2 seconds before next batch...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`Error processing batch ${batchIndex + 1}:`, error);
      }
    }

    console.log(`Categorized ${totalCategorized} tags with ${totalAssignments} assignments across ${batches.length} batches`);

    return new Response(JSON.stringify({
      success: true,
      categorized_count: totalCategorized,
      assignments_created: totalAssignments,
      total_tags: tagsToProcess.length,
      batches_processed: batches.length,
      message: `Successfully categorized ${totalCategorized} out of ${tagsToProcess.length} tags (${totalAssignments} assignments created)`
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
