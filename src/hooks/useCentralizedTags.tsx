import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { normalizeTagName } from '@/utils/tagNormalization';

export interface TagCategoryInfo {
  id: string;
  name: string;
  is_primary: boolean;
  level?: number;
  parent_id?: string | null;
  parent_name?: string | null;
  slug?: string;
}

export interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  level: number;
  sort_order: number;
  description?: string;
  color?: string;
  tag_count: number;
  total_tag_count: number;
  children: CategoryTreeChild[];
}

export interface CategoryTreeChild {
  id: string;
  name: string;
  slug: string;
  level: number;
  sort_order: number;
  description?: string;
  color?: string;
  parent_id: string;
  tag_count: number;
}

/**
 * A `unified_tags` row. Shared with the detail page and the CMS, which fetch
 * their own single row and legitimately read the whole width of it.
 *
 * `useCentralizedTags` does NOT fill all of this — it fetches only
 * TAG_INDEX_COLUMNS (see there for why), so on a tag that came from this hook
 * every field outside that list is `undefined` at runtime even where the type
 * permits a value. Optionality is what makes that safe; do not tighten a field
 * to required, and do not read one of the excluded fields off `allTags`.
 */
export interface CentralizedTag {
  id: string;
  name: string;
  slug: string;
  category?: string;
  categories?: TagCategoryInfo[];
  description?: string;
  short_description?: string | null;
  /** `concept` | `practice` | `aesthetic` | `descriptor` | `label` | `person`. */
  entity_kind?: string | null;
  usage_count: number;
  status?: string;
  deprecation_reason?: string | null;
  created_at: string;

  /* ── Not fetched by useCentralizedTags — detail-page / CMS only. ────── */
  /** Long-form editorial body shown on the tag detail page (wiki/guide voice). */
  long_description?: string | null;
  image_url?: string;
  /** Attribution / source for the hero image (license compliance caption). */
  image_attribution?: string | null;
  image_source?: string | null;
  /** External knowledge links surfaced as "Learn more" / facts. */
  wikipedia_url?: string | null;
  wikidata_id?: string | null;
  scientific_data?: Record<string, unknown> | null;
  seo_indexable?: boolean;
  is_sensitive?: boolean;
  is_adult?: boolean;
  updated_at?: string;
}

export interface TagCategory {
  category: string;
  tags: CentralizedTag[];
  count: number;
}

interface CentralizedTagsData {
  allTags: CentralizedTag[];
  tagsByCategory: TagCategory[];
  categoriesTree: CategoryTreeNode[];
}

/** Module-level so the loading/error fallbacks keep a stable identity. */
const EMPTY_TAGS: CentralizedTag[] = [];
const EMPTY_CATEGORIES: TagCategory[] = [];
const EMPTY_TREE: CategoryTreeNode[] = [];

/**
 * The columns /tags, the tag picker and /admin/tags actually render.
 *
 * This was `select=*`, and `*` on this table is 42 columns wide — including
 * `long_description` (full wiki bodies), `description_i18n`/`name_i18n` and
 * `quality_breakdown`. Measured on prod 2026-09-05: the active corpus came to
 * **7.98 MB** as `*` against **1.98 MB** as this list, for an index that shows
 * a name, a blurb and a use count. That payload — not the query, which returns
 * in ~0.2s server-side — is what put a signed-in /tags load at 28.9s and started
 * timing out the nightly e2e specs.
 *
 * Adding a column here is a real cost paid by every reader on every visit. If a
 * SINGLE surface needs a field, fetch that row where you need it instead.
 */
export const TAG_INDEX_COLUMNS =
  'id, name, slug, category, description, short_description, usage_count, created_at, entity_kind, status, deprecation_reason';

const PAGE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
  count: number | null;
}

/**
 * Read a whole table through PostgREST's max-rows cap (1000), CONCURRENTLY.
 *
 * The first page carries an exact count, so every remaining page can be fired
 * at once instead of walking `range()` in a loop — the corpus grows daily and a
 * sequential pager makes the page's round-trip DEPTH a function of row count
 * (the assignments table alone is at 8 pages and climbing).
 *
 * `page` MUST order by a fully unique key. Concurrent `range()` requests are
 * independent queries: under a non-unique sort Postgres may order ties
 * differently per request, which silently duplicates rows into one page and
 * drops them from another.
 *
 * A failed page THROWS rather than returning what arrived. A short corpus here
 * is not a degraded glossary — it is a wrong one: missing category assignments
 * are what the adult age-gate reads, and a tag with no categories can never
 * match ADULT_CATEGORY_NAMES, so a swallowed page un-gates 18+ terms. React
 * Query retries; a silent truncation does not.
 */
export async function fetchAllPages<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const first = await page(0, PAGE - 1);
  if (first.error) throw new Error(`${label}: ${first.error.message}`);
  const rows = first.data ?? [];
  const total = first.count ?? rows.length;
  if (rows.length < PAGE || total <= PAGE) return rows;

  const rest = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE) - 1 }, (_, i) =>
      page((i + 1) * PAGE, (i + 2) * PAGE - 1),
    ),
  );
  for (const r of rest) {
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
    rows.push(...(r.data ?? []));
  }
  return rows;
}

interface AssignmentRow {
  tag_id: string;
  category_id: string;
  is_primary: boolean;
}

// No `tag_categories(...)` embed: `allCats` below already reads that whole
// table (53 rows, 8 KB) for the parent lookup, so embedding it per assignment
// re-sent the same 53 categories 7,201 times — 307 KB per page against 124 KB.
function fetchAllAssignments(): Promise<AssignmentRow[]> {
  return fetchAllPages('tag_category_assignments', (from, to) =>
    supabase
      .from('tag_category_assignments')
      .select('tag_id, category_id, is_primary', { count: 'exact' })
      .order('tag_id', { ascending: true })
      // Second key is load-bearing: a tag has many assignments, so `tag_id`
      // alone is not a unique order and the concurrent pages could disagree.
      .order('category_id', { ascending: true })
      .range(from, to),
  );
}

function fetchAllActiveTags(): Promise<Record<string, unknown>[]> {
  return fetchAllPages('unified_tags', (from, to) =>
    supabase
      .from('unified_tags')
      .select(TAG_INDEX_COLUMNS, { count: 'exact' })
      .eq('status', 'active')
      .order('usage_count', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  ) as Promise<Record<string, unknown>[]>;
}

async function fetchAllTagsWithCategories(): Promise<CentralizedTagsData> {
  // Run independent queries in parallel
  const [data, catAssignments, allCatsResult, treeResult] = await Promise.all([
    fetchAllActiveTags(),
    fetchAllAssignments(),
    supabase.from('tag_categories').select('id, name, slug, level, parent_id'),
    supabase.rpc('get_category_tree'),
  ]);
  // Every tag's category name, slug and parent now come from THIS result — the
  // assignment rows carry ids only. Failing it silently would leave every tag
  // category-less, which is the age-gate hole described on fetchAllPages.
  if (allCatsResult.error) throw new Error(`tag_categories: ${allCatsResult.error.message}`);
  const allCats = allCatsResult.data;
  const treeData = treeResult.data;

  // Parent name lookup
  const catLookup = new Map<
    string,
    { name: string; slug: string; level: number; parent_id: string | null }
  >();
  if (allCats) {
    for (const c of allCats) {
      catLookup.set(c.id, { name: c.name, slug: c.slug, level: c.level, parent_id: c.parent_id });
    }
  }

  // Build tag_id → categories map
  const tagCatsMap = new Map<string, TagCategoryInfo[]>();
  if (catAssignments) {
    for (const a of catAssignments) {
      const cat = catLookup.get(a.category_id);
      if (!cat) continue;
      const parentInfo = cat.parent_id ? catLookup.get(cat.parent_id) : null;
      if (!tagCatsMap.has(a.tag_id)) tagCatsMap.set(a.tag_id, []);
      tagCatsMap.get(a.tag_id)!.push({
        id: a.category_id,
        name: cat.name,
        slug: cat.slug,
        level: cat.level,
        parent_id: cat.parent_id,
        parent_name: parentInfo?.name || null,
        is_primary: a.is_primary,
      });
    }
    // Sort: primary first
    for (const [, cats] of tagCatsMap) {
      cats.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
    }
  }

  // Enrich tags with categories array
  const enrichedTags: CentralizedTag[] = data.map((tag) => ({
    ...tag,
    categories: tagCatsMap.get(tag.id) || [],
  }));

  // Group tags by their (one) primary category AND every ancestor parent, so
  // `tagsByCategory['Sexuality & Kink']` contains every tag whose primary
  // child lives under that parent. Each tag lands in exactly one child.
  const categoryMap = new Map<string, CentralizedTag[]>();
  for (const tag of enrichedTags) {
    const primary = tag.categories?.find((c) => c.is_primary) ?? tag.categories?.[0];
    if (!primary) continue;
    const buckets = new Set<string>();
    buckets.add(primary.name);
    if (primary.parent_name) buckets.add(primary.parent_name);
    for (const catName of buckets) {
      if (!categoryMap.has(catName)) categoryMap.set(catName, []);
      categoryMap.get(catName)!.push(tag);
    }
  }

  const tagsByCategory: TagCategory[] = Array.from(categoryMap.entries())
    .map(([category, tags]) => ({
      category,
      tags: tags.sort((a, b) => b.usage_count - a.usage_count),
      count: tags.length,
    }))
    .sort((a, b) => b.count - a.count);

  const categoriesTree = (treeData as unknown as CategoryTreeNode[]) || [];

  return { allTags: enrichedTags, tagsByCategory, categoriesTree };
}

/**
 * Primary hook — uses React Query for caching, deduplication, and stale-while-revalidate.
 * Returns the same shape as the old useState-based hook for backwards compatibility.
 */
export const useCentralizedTags = () => {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['centralized-tags'],
    queryFn: fetchAllTagsWithCategories,
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 15 * 60 * 1000, // 15 min
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 5000),
  });

  // Shared frozen empties, not `?? []`. A fresh array literal is a NEW
  // reference on every render, so while the query is loading or errored these
  // three change identity each pass — and every consumer memo keyed on them
  // (TagsIndex alone has three) recomputes instead of memoizing. Stable
  // references also let the React Compiler preserve that memoization.
  const allTags = data?.allTags ?? EMPTY_TAGS;
  const tagsByCategory = data?.tagsByCategory ?? EMPTY_CATEGORIES;
  const categoriesTree = data?.categoriesTree ?? EMPTY_TREE;

  const searchTags = async (query: string): Promise<CentralizedTag[]> => {
    try {
      // Sanitize query to prevent PostgREST filter injection —
      // strip characters that have special meaning in PostgREST filter syntax.
      const sanitized = query.replace(/[,%()\\]/g, '');
      if (!sanitized) return [];

      const { data, error } = await supabase
        .from('unified_tags')
        // Same columns as the corpus above — a search hit and a browsed tag are
        // rendered by the same components and must carry the same fields.
        .select(TAG_INDEX_COLUMNS)
        .eq('status', 'active')
        .or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
        .order('usage_count', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error searching tags:', err);
      return [];
    }
  };

  const getTagsByCategory = (category: string): CentralizedTag[] => {
    return allTags.filter((tag) =>
      tag.categories?.some((c) => c.name === category || c.parent_name === category),
    );
  };

  const getTagsByParent = (parentName: string): CentralizedTag[] => {
    return allTags.filter((tag) => {
      const primary = tag.categories?.find((c) => c.is_primary) ?? tag.categories?.[0];
      return primary?.parent_name === parentName || primary?.name === parentName;
    });
  };

  const getTagsBySubcategory = (categoryId: string): CentralizedTag[] => {
    return allTags.filter((tag) => {
      if (tag.categories && tag.categories.length > 0) {
        return tag.categories.some((c) => c.id === categoryId);
      }
      return false;
    });
  };

  const getParentCategory = (categoryName: string): CategoryTreeNode | null => {
    for (const parent of categoriesTree) {
      if (parent.children.some((c) => c.name === categoryName)) {
        return parent;
      }
    }
    return null;
  };

  const getPopularTags = (limit: number = 10): CentralizedTag[] => {
    return allTags.filter((tag) => tag.usage_count > 0).slice(0, limit);
  };

  const refreshTags = () => {
    queryClient.invalidateQueries({ queryKey: ['centralized-tags'] });
  };

  const createTag = async (tagData: {
    name: string;
    slug: string;
    category?: string | null;
    description?: string | null;
  }): Promise<CentralizedTag | null> => {
    try {
      const normalizedName = normalizeTagName(tagData.name);
      const { data, error } = await supabase
        .from('unified_tags')
        .insert([
          {
            ...tagData,
            name: normalizedName,
            slug: tagData.slug || normalizedName.toLowerCase().replace(/\s+/g, '-'),
          },
        ])
        .select()
        .single();

      if (error) throw error;
      refreshTags();
      return data;
    } catch (err) {
      console.error('Error creating tag:', err);
      throw err;
    }
  };

  const updateTag = async (id: string, updates: Partial<CentralizedTag>): Promise<void> => {
    try {
      const finalUpdates =
        typeof updates.name === 'string'
          ? { ...updates, name: normalizeTagName(updates.name) }
          : updates;
      const { error } = await supabase.from('unified_tags').update(finalUpdates).eq('id', id);

      if (error) throw error;
      refreshTags();
    } catch (err) {
      console.error('Error updating tag:', err);
      throw err;
    }
  };

  const deleteTag = async (id: string): Promise<void> => {
    try {
      // NOT `.from('unified_tags').delete()`. A raw delete cascades away the
      // tag's legal citations (tag_sources), its clinical codes, its ontology
      // edges and the curated health content hanging off it; leaves
      // tag_slug_redirects pointing at nothing (ON DELETE SET NULL); and leaves
      // `tags text[]` on 20+ content tables still naming a tag whose page is
      // now a 404 — those arrays carry no foreign key, so nothing notices.
      // admin_delete_tag refuses when any of that holds and names what is in
      // the way; merge_tag_concept is the action that preserves it.
      //
      // This is the hook /admin/tags actually calls. useUnifiedTags has a
      // near-identical deleteTag and is routed the same way, so neither is a
      // way back to the raw delete.
      const { error } = await untypedRpc('admin_delete_tag', {
        p_tag_id: id,
        p_reason: null,
      });

      // Rethrow as a real Error. untypedRpc yields a plain `{ message }`, and
      // every caller here narrows with `err instanceof Error` — so throwing the
      // bare object silently discards the refusal breakdown that is the entire
      // reason this RPC exists, leaving the admin with "Failed to delete tag".
      if (error) throw new Error(error.message);
      refreshTags();
    } catch (err) {
      console.error('Error deleting tag:', err);
      throw err;
    }
  };

  return {
    allTags,
    tagsByCategory,
    categoriesTree,
    loading: isLoading,
    error: queryError
      ? queryError instanceof Error
        ? queryError.message
        : 'Failed to fetch tags'
      : null,
    searchTags,
    getTagsByCategory,
    getTagsByParent,
    getTagsBySubcategory,
    getParentCategory,
    getPopularTags,
    createTag,
    updateTag,
    deleteTag,
    refreshTags,
  };
};

/** Disjoint entity_type buckets in `tag_usage_summary`. No roll-up column exists. */
const ENTITY_COUNT_COLUMNS = [
  'venue_count',
  'event_count',
  'group_count',
  'news_count',
  'post_count',
  'marketplace_count',
  'content_count',
] as const;

/**
 * Efficient usage counts from the DB view — replaces the O(n²) client-side
 * computation that fetched all venues/groups/events and looped over all tags.
 */
export function useTagUsageCounts() {
  return useQuery({
    queryKey: ['tag-usage-counts'],
    queryFn: async (): Promise<Record<string, number>> => {
      // Same PostgREST max-rows cap as fetchAllActiveTags above: the view has
      // ~9.6k rows, so an unpaged select returned only the first 1000 and
      // ~8.6k tags rendered "0 uses" — which also silently broke sort=usage
      // and the used/unused filter. Rows where every bucket is 0 are
      // equivalent to absent (consumers default missing keys to 0), so filter
      // to rows with any usage and page through the rest.
      const ANY_USAGE = ['usage_count', ...ENTITY_COUNT_COLUMNS]
        .map((col) => `${col}.gt.0`)
        .join(',');
      let data: Array<Record<string, number | string>> = [];
      let fetchError: unknown = null;
      try {
        data = await fetchAllPages<Record<string, number | string>>(
          'tag_usage_summary',
          (from, to) =>
            supabase
              .from('tag_usage_summary' as 'venues')
              .select(
                'id, name, usage_count, venue_count, event_count, group_count, news_count, post_count, marketplace_count, content_count',
                { count: 'exact' },
              )
              .or(ANY_USAGE)
              .order('id', { ascending: true })
              .range(from, to) as unknown as PromiseLike<
              PageResult<Record<string, number | string>>
            >,
        );
      } catch (err) {
        fetchError = err;
      }

      // Unlike the corpus fetch, this one degrades rather than throws: a use
      // count is a label on a card, not a gate, so a broken page here must not
      // take the glossary down with it.
      if (fetchError) {
        console.error('Error fetching tag usage counts:', fetchError);
        // Fallback: top tags by the denormalized counter (capped at max-rows,
        // so order by usage to keep the rows that matter).
        const { data: tags } = await supabase
          .from('unified_tags')
          .select('name, usage_count')
          .eq('status', 'active')
          .gt('usage_count', 0)
          .order('usage_count', { ascending: false })
          .limit(1000);

        const map: Record<string, number> = {};
        for (const row of tags || []) {
          map[row.name] = row.usage_count || 0;
        }
        return map;
      }

      const map: Record<string, number> = {};
      for (const row of data) {
        // Every *_count in the view is a disjoint entity_type bucket of
        // unified_tag_assignments (verified against pg_get_viewdef) — there is
        // no roll-up column, so summing all seven is the true cross-content
        // count. Summing only venue/event/group, as this did until 2026-08-12,
        // reported 0 uses for every news- or marketplace-only tag and silently
        // mis-ordered `sort=usage` and the used/unused filter.
        const total = ENTITY_COUNT_COLUMNS.reduce((sum, col) => sum + (Number(row[col]) || 0), 0);
        map[row.name as string] = total > 0 ? total : Number(row.usage_count) || 0;
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
