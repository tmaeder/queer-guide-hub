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

// ── Content type registry: maps entity type → DB table + text fields ──

interface ContentTypeConfig {
  table: string;
  textFields: string[];
  nameField: string;
  selectFields: string;
}

const CONTENT_TYPES: Record<string, ContentTypeConfig> = {
  venues: {
    table: 'venues',
    textFields: ['name', 'description', 'category', 'city', 'country', 'address'],
    nameField: 'name',
    selectFields: 'id, name, description, category, city, country, address',
  },
  events: {
    table: 'events',
    textFields: ['title', 'description', 'event_type', 'venue_name', 'city', 'country'],
    nameField: 'title',
    selectFields: 'id, title, description, event_type, venue_name, city, country',
  },
  personalities: {
    table: 'personalities',
    textFields: ['name', 'bio', 'profession', 'lgbti_connection', 'nationality'],
    nameField: 'name',
    selectFields: 'id, name, bio, profession, lgbti_connection, nationality',
  },
  news_articles: {
    table: 'news_articles',
    textFields: ['title', 'excerpt', 'category'],
    nameField: 'title',
    selectFields: 'id, title, excerpt, category',
  },
  cities: {
    table: 'cities',
    textFields: ['name', 'description'],
    nameField: 'name',
    selectFields: 'id, name, description',
  },
  countries: {
    table: 'countries',
    textFields: ['name', 'description'],
    nameField: 'name',
    selectFields: 'id, name, description',
  },
  marketplace_listings: {
    table: 'marketplace_listings',
    textFields: ['title', 'description', 'category', 'location'],
    nameField: 'title',
    selectFields: 'id, title, description, category, location',
  },
  community_groups: {
    table: 'community_groups',
    textFields: ['name', 'description', 'rules'],
    nameField: 'name',
    selectFields: 'id, name, description, rules',
  },
};

// ── Helpers ──────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function buildEntityText(item: Record<string, unknown>, textFields: string[]): string {
  return textFields
    .map(f => item[f])
    .filter(Boolean)
    .join('. ')
    .slice(0, 2000);
}

interface AISuggestion {
  name: string;
  confidence: number;
  is_new: boolean;
  category?: string;
  tag_id?: string;
}

async function callOpenAI(prompt: string, systemPrompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ── Main handler ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      content_type,
      content_id,
      batch = false,
      batch_limit = 50,
      dry_run = false,
      auto_approve_threshold = 0.85,
      max_tags_per_item = 8,
    } = body;

    // Validate content type
    const config = CONTENT_TYPES[content_type];
    if (!config) {
      return new Response(JSON.stringify({
        success: false,
        error: `Invalid content_type. Must be one of: ${Object.keys(CONTENT_TYPES).join(', ')}`,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Pre-load reference data (cached for entire request) ──

    // Top 500 existing tags by usage
    const { data: existingTags } = await supabase
      .from('unified_tags')
      .select('id, name, slug')
      .order('usage_count', { ascending: false })
      .limit(500);

    const tagMap = new Map<string, { id: string; name: string }>();
    for (const tag of existingTags || []) {
      tagMap.set(tag.slug, { id: tag.id, name: tag.name });
      tagMap.set(tag.name.toLowerCase(), { id: tag.id, name: tag.name });
    }

    const existingTagNames = (existingTags || []).map(t => t.name);

    // Tag categories
    const { data: categories } = await supabase
      .from('tag_categories')
      .select('id, slug')
      .order('sort_order');

    const categoryMap = new Map<string, string>();
    for (const cat of categories || []) {
      categoryMap.set(cat.slug, cat.id);
    }
    const categorySlugs = (categories || []).map(c => c.slug);

    // ── Fetch items to process ──

    let items: Record<string, unknown>[] = [];

    if (batch) {
      // Batch mode: fetch items without tag assignments
      const { data: allItems } = await supabase
        .from(config.table)
        .select(config.selectFields)
        .limit(batch_limit * 2); // Fetch extra, will filter

      if (allItems && allItems.length > 0) {
        // Check which already have assignments
        const itemIds = allItems.map(i => (i as any).id);
        const { data: existing } = await supabase
          .from('unified_tag_assignments')
          .select('entity_id')
          .eq('entity_type', content_type)
          .in('entity_id', itemIds);

        const assignedIds = new Set((existing || []).map(e => e.entity_id));
        items = allItems.filter(i => !assignedIds.has((i as any).id)).slice(0, batch_limit);
      }

      if (items.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          message: `No untagged ${content_type} found`,
          items_processed: 0,
          suggestions: [],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else if (content_id) {
      // Single item mode
      const { data: item, error } = await supabase
        .from(config.table)
        .select(config.selectFields)
        .eq('id', content_id)
        .single();

      if (error || !item) {
        return new Response(JSON.stringify({
          success: false,
          error: `${content_type} with id ${content_id} not found`,
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      items = [item];
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: 'Must provide content_id for single mode or batch: true for batch mode',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Process items ──

    const batchId = crypto.randomUUID();
    const systemPrompt = 'You are a tag suggestion engine for queer.guide, an LGBTQ+ travel and community platform. Always respond with valid JSON only, no markdown.';

    const allResults: Array<{
      entity_id: string;
      entity_type: string;
      entity_name: string;
      tags: AISuggestion[];
      auto_approved: number;
      pending_review: number;
    }> = [];

    let totalSuggestions = 0;
    let totalAutoApproved = 0;
    let newTagsCreated = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i] as Record<string, unknown>;
      const entityId = item.id as string;
      const entityName = (item[config.nameField] || 'Unknown') as string;
      const entityText = buildEntityText(item, config.textFields);

      if (!entityText || entityText.length < 5) {
        console.log(`Skipping ${entityName} — insufficient text`);
        continue;
      }

      // Build AI prompt
      const prompt = `Suggest ${max_tags_per_item > 5 ? '3-' + max_tags_per_item : '2-' + max_tags_per_item} relevant tags for this ${content_type.replace('_', ' ')} item.

ITEM:
Name: ${entityName}
Content: ${entityText}

EXISTING TAGS (strongly prefer these over creating new tags):
${existingTagNames.slice(0, 300).join(', ')}

TAG CATEGORIES (for classifying any new tag suggestions):
${categorySlugs.join(', ')}

Rules:
1. Prefer EXISTING tags — only suggest a new tag if nothing existing captures an important aspect.
2. Each tag needs a confidence score from 0.0 to 1.0.
3. Only suggest tags genuinely relevant to the LGBTQ+ community context.
4. For new tags, provide the best category slug from the list above.
5. Tag names should be lowercase, human-readable terms.

Return ONLY JSON: {"tags":[{"name":"tag name","confidence":0.95,"is_new":false},{"name":"new tag","confidence":0.75,"is_new":true,"category":"community-terms"}]}`;

      // Call OpenAI with retry on rate limit
      let aiContent: string;
      try {
        aiContent = await callOpenAI(prompt, systemPrompt);
      } catch (err) {
        if ((err as Error).message === 'RATE_LIMIT') {
          console.log(`Rate limit hit on item ${i + 1}, waiting 60s...`);
          await new Promise(r => setTimeout(r, 60000));
          try {
            aiContent = await callOpenAI(prompt, systemPrompt);
          } catch {
            console.error(`Failed item ${entityName} after retry`);
            continue;
          }
        } else {
          console.error(`Error for ${entityName}:`, err);
          continue;
        }
      }

      // Parse AI response
      let suggestions: AISuggestion[];
      try {
        const cleaned = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        suggestions = (parsed.tags || []).slice(0, max_tags_per_item);
      } catch {
        console.error(`Failed to parse AI response for ${entityName}:`, aiContent);
        continue;
      }

      // ── Match suggestions to existing tags ──

      for (const suggestion of suggestions) {
        const slug = toSlug(suggestion.name);
        const match = tagMap.get(slug) || tagMap.get(suggestion.name.toLowerCase());
        if (match) {
          suggestion.tag_id = match.id;
          suggestion.is_new = false;
          suggestion.name = match.name; // Use canonical name
        }
      }

      // ── Create new tags + write suggestions (non-dry-run) ──

      let autoApproved = 0;
      const pendingReview = suggestions.length;

      if (!dry_run) {
        // Create new tags
        for (const s of suggestions.filter(s => s.is_new && !s.tag_id)) {
          const slug = toSlug(s.name);
          const catId = categoryMap.get(s.category || 'general') || categoryMap.get('general');

          const { data: newTag, error: createErr } = await supabase
            .from('unified_tags')
            .upsert({
              name: s.name,
              slug,
              category_id: catId || null,
              color: '#6366f1',
              usage_count: 0,
            }, { onConflict: 'slug' })
            .select('id')
            .single();

          if (newTag) {
            s.tag_id = newTag.id;
            newTagsCreated++;
            // Add to cache for subsequent items
            tagMap.set(slug, { id: newTag.id, name: s.name });
          } else if (createErr) {
            console.error(`Failed to create tag "${s.name}":`, createErr.message);
          }
        }

        // Upsert into tag_suggestions
        const rows = suggestions
          .filter(s => s.tag_id)
          .map(s => ({
            entity_id: entityId,
            entity_type: content_type,
            tag_id: s.tag_id!,
            suggested_tag_name: s.name,
            confidence: s.confidence,
            source: 'auto_tag',
            status: 'pending',
            batch_id: batchId,
            ai_model: 'gpt-4o-mini',
          }));

        if (rows.length > 0) {
          const { data: inserted, error: insertErr } = await supabase
            .from('tag_suggestions')
            .upsert(rows, { onConflict: 'entity_id,entity_type,suggested_tag_name' })
            .select('id, confidence');

          if (insertErr) {
            console.error(`Failed to upsert suggestions for ${entityName}:`, insertErr.message);
          }

          // Auto-approve high confidence
          if (inserted && inserted.length > 0) {
            const highConfIds = inserted
              .filter(r => Number(r.confidence) >= auto_approve_threshold)
              .map(r => r.id);

            if (highConfIds.length > 0) {
              const { data: approvedCount } = await supabase
                .rpc('approve_tag_suggestions', {
                  p_suggestion_ids: highConfIds,
                  p_reviewer_id: null,
                });

              autoApproved = Number(approvedCount) || highConfIds.length;
              totalAutoApproved += autoApproved;
            }
          }
        }
      }

      totalSuggestions += suggestions.length;

      allResults.push({
        entity_id: entityId,
        entity_type: content_type,
        entity_name: entityName,
        tags: suggestions,
        auto_approved: autoApproved,
        pending_review: pendingReview - autoApproved,
      });

      // Rate limiting between items
      if (i < items.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    return new Response(JSON.stringify({
      success: true,
      batch_id: batchId,
      dry_run,
      items_processed: allResults.length,
      suggestions: allResults,
      new_tags_created: newTagsCreated,
      total_suggestions: totalSuggestions,
      total_auto_approved: totalAutoApproved,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in auto-tag-content:', error);
    return new Response(JSON.stringify({
      success: false,
      error: (error as Error).message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
