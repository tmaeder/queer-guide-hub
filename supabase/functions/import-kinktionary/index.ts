import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient, corsHeaders, corsResponse, jsonResponse, errorResponse } from "../_shared/supabase-client.ts";

// FetLife Kinktionary category -> Queer Guide tag_categories slug mapping
const CATEGORY_MAPPING: Record<string, string> = {
  'Genders': 'gender-identity',
  'Sexual Orientations': 'sexual-orientation',
  'Romantic Orientations': 'relationships',
  'Relationships': 'relationships',
  'Roles': 'roles-dynamics',
  'Kink Activities': 'kink-fetish',
  'Sexual Activities': 'kink-fetish',
  'Philia/Fetish': 'fetish-practices',
  'Toys & Equipment': 'leather-gear',
  'Sex Slang': 'slang-terminology',
  'Glossary': 'slang-terminology',
  'Abbreviations': 'slang-terminology',
  'Gay Culture': 'culture-slang',
  'Pop Culture': 'culture-slang',
  'Pornography': 'culture-slang',
  'Consent': 'safety-practices',
  'Scene Safety': 'safety-practices',
  'Sexual Health': 'sexual-health',
  'Mental Health': 'mental-health',
  'Events': 'community-events',
  'Holidays': 'community-events',
  'Play Spaces': 'venue-travel',
  'Safety Resources': 'support-resources',
  'Disability': 'support-resources',
};

interface KinktionaryTerm {
  name: string;
  description: string;
  fetlife_url: string;
  fetlife_category: string;
}

function generateSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  if (req.method !== 'POST') {
    return errorResponse('POST required with { terms: [...] }', 405);
  }

  try {
    const supabase = getServiceClient();
    const body = await req.json();
    const terms: KinktionaryTerm[] = body.terms || [];
    const dryRun = body.dry_run === true;
    const updateExisting = body.update_existing === true;

    if (!Array.isArray(terms) || terms.length === 0) {
      return errorResponse('No terms provided. POST { terms: [{ name, description, fetlife_url, fetlife_category }] }', 400);
    }

    console.log(`Kinktionary import: ${terms.length} terms, dry_run=${dryRun}, update_existing=${updateExisting}`);

    // Step 1: Load category slug -> ID mapping from DB
    const { data: categories, error: catError } = await supabase
      .from('tag_categories')
      .select('id, slug, name');

    if (catError) throw new Error(`Failed to load categories: ${catError.message}`);

    const categorySlugToId = new Map<string, string>();
    for (const cat of categories || []) {
      categorySlugToId.set(cat.slug, cat.id);
    }

    // Step 2: Pre-load ALL existing tag slugs for O(1) dedup
    // Supabase default limit is 1000, so paginate to get all tags
    const existingBySlug = new Map<string, { id: string; name: string; description: string | null; status: string }>();
    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: page, error: pageErr } = await supabase
        .from('unified_tags')
        .select('id, slug, name, description, status')
        .range(offset, offset + PAGE_SIZE - 1);

      if (pageErr) throw new Error(`Failed to load existing tags: ${pageErr.message}`);

      for (const tag of page || []) {
        existingBySlug.set(tag.slug, tag);
      }
      hasMore = (page?.length || 0) === PAGE_SIZE;
      offset += PAGE_SIZE;
    }
    console.log(`Loaded ${existingBySlug.size} existing tag slugs for dedup`);

    // Step 3: Load aliases for additional dedup
    const { data: aliases } = await supabase
      .from('tag_aliases')
      .select('alias_slug, canonical_tag_id');

    const aliasSlugs = new Map<string, string>();
    for (const alias of aliases || []) {
      aliasSlugs.set(alias.alias_slug, alias.canonical_tag_id);
    }

    // Step 4: Process each term
    const stats = {
      total: terms.length,
      inserted: 0,
      skipped_existing: 0,
      skipped_alias: 0,
      skipped_merged: 0,
      updated: 0,
      errors: 0,
      unmapped_categories: [] as string[],
    };
    const unmappedSet = new Set<string>();
    const insertErrors: Array<{ term: string; error: string }> = [];
    const insertedTerms: string[] = [];
    const skippedTerms: Array<{ term: string; reason: string }> = [];

    const toInsert: Array<{
      name: string;
      description: string | null;
      category_id: string | null;
      color: string;
      usage_count: number;
      status: string;
    }> = [];

    for (const term of terms) {
      const name = term.name?.trim();
      if (!name) {
        stats.errors++;
        insertErrors.push({ term: '(empty)', error: 'Empty name' });
        continue;
      }

      const slug = generateSlug(name);
      if (!slug) {
        stats.errors++;
        insertErrors.push({ term: name, error: 'Generated empty slug' });
        continue;
      }

      // Dedup 1: exact slug match against existing tags
      const existing = existingBySlug.get(slug);
      if (existing) {
        if (existing.status === 'merged') {
          stats.skipped_merged++;
          skippedTerms.push({ term: name, reason: 'merged' });
          continue;
        }
        if (updateExisting && term.description && !existing.description) {
          // Backfill description on existing tag that has none
          if (!dryRun) {
            const desc = term.description.slice(0, 500);
            await supabase
              .from('unified_tags')
              .update({ description: desc })
              .eq('id', existing.id);
          }
          stats.updated++;
        } else {
          stats.skipped_existing++;
          skippedTerms.push({ term: name, reason: 'exists' });
        }
        continue;
      }

      // Dedup 2: alias match
      if (aliasSlugs.has(slug)) {
        stats.skipped_alias++;
        skippedTerms.push({ term: name, reason: 'alias_match' });
        continue;
      }

      // Map FetLife category -> QG category_id
      const qgCategorySlug = CATEGORY_MAPPING[term.fetlife_category];
      let categoryId: string | null = null;

      if (qgCategorySlug) {
        categoryId = categorySlugToId.get(qgCategorySlug) || null;
      }

      if (!categoryId) {
        unmappedSet.add(term.fetlife_category || '(none)');
        categoryId = categorySlugToId.get('miscellaneous') || null;
      }

      // Build description
      let description: string | null = null;
      if (term.description) {
        description = term.description.slice(0, 500);
      }

      toInsert.push({
        name,
        description,
        category_id: categoryId,
        color: '#6366f1',
        usage_count: 0,
        status: 'active',
      });

      // Track in existing map to catch dupes within the batch
      existingBySlug.set(slug, { id: 'pending', name, description, status: 'active' });
    }

    stats.unmapped_categories = [...unmappedSet];

    // Step 5: Batch insert in groups of 100
    if (!dryRun && toInsert.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        console.log(`Inserting batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toInsert.length / BATCH_SIZE)} (${batch.length} tags)`);

        const { data: inserted, error: insertError } = await supabase
          .from('unified_tags')
          .insert(batch)
          .select('id, name, slug');

        if (insertError) {
          console.error(`Batch error: ${insertError.message}. Falling back to individual inserts.`);
          // Fallback: insert one by one to skip only the problematic rows
          for (const item of batch) {
            const { error: singleErr } = await supabase
              .from('unified_tags')
              .insert(item);

            if (singleErr) {
              stats.errors++;
              insertErrors.push({ term: item.name, error: singleErr.message });
            } else {
              stats.inserted++;
              insertedTerms.push(item.name);
            }
          }
        } else {
          const count = inserted?.length || batch.length;
          stats.inserted += count;
          for (const item of (inserted || batch)) {
            insertedTerms.push(item.name);
          }
        }
      }
    } else if (dryRun) {
      stats.inserted = toInsert.length; // Would-be inserted count
      for (const item of toInsert) {
        insertedTerms.push(item.name);
      }
    }

    const response = {
      success: true,
      dry_run: dryRun,
      stats,
      inserted_sample: insertedTerms.slice(0, 30),
      skipped_sample: skippedTerms.slice(0, 30),
      errors_sample: insertErrors.slice(0, 20),
    };

    console.log('Kinktionary import complete:', JSON.stringify(stats));

    return jsonResponse(response);

  } catch (error) {
    console.error('Kinktionary import error:', error);
    return errorResponse('Internal server error');
  }
});
