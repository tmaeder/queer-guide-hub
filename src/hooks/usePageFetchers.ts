/**
 * DUP-4 — small page-specific fetchers / mutations extracted out of pages.
 * Grouped here rather than splitting into one hook file per page.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STALE = 5 * 60_000;
const STALE_LONG = 30 * 60_000;

/** HotelDetail.tsx fallback when slug is a uuid. */
export function useHotelByIdFallback<T = unknown>(
  joinSpec: string,
  idOrSlug: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['hotel-by-id-fallback', idOrSlug, joinSpec],
    enabled: enabled && !!idOrSlug,
    staleTime: STALE,
    queryFn: async (): Promise<T | null> => {
      const { data } = await supabase
        .from('hotels')
        .select(joinSpec)
        .eq('id', idOrSlug as string)
        .maybeSingle();
      return (data as T | null) ?? null;
    },
  });
}

/** PersonalityDetail.tsx — fetch country id by name. */
export function useCountryIdByName(name: string | null | undefined) {
  return useQuery({
    queryKey: ['country-id-by-name', name],
    enabled: !!name,
    staleTime: STALE_LONG,
    queryFn: async () => {
      const { data } = await supabase
        .from('countries')
        .select('id')
        .eq('name', name as string)
        .maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
  });
}

/** SubmitForm.tsx — fetch country name by id. */
export async function fetchCountryNameById(id: string): Promise<string | null> {
  const { data } = await supabase.from('countries').select('name').eq('id', id).single();
  return (data?.name as string | undefined) ?? null;
}

/** ProfessionDetail.tsx — list personalities (filtered downstream). */
export function usePersonalitiesByProfession() {
  return useQuery({
    queryKey: ['personalities-with-profession'],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personalities')
        .select('*')
        .not('profession', 'is', null)
        .is('duplicate_of_id', null)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** AdminGroups.tsx — delete community group. */
export async function deleteCommunityGroup(id: string) {
  const { error } = await supabase.from('community_groups').delete().eq('id', id);
  return { error };
}

/** AdminMarketplace.tsx — delete marketplace listing. */
export async function deleteMarketplaceListing(id: string) {
  const { error } = await supabase.from('marketplace_listings').delete().eq('id', id);
  return { error };
}

/** AdminRedirects.tsx — fetch full redirect by id. */
export async function fetchRedirectById<T = unknown>(id: string): Promise<T | null> {
  const { data } = await supabase.from('redirects').select('*').eq('id', id).single();
  return (data as T | null) ?? null;
}

/** EventDetail.tsx — upsert attendance. */
export async function upsertEventAttendance(payload: {
  event_id: string;
  user_id: string;
  status: string;
}) {
  const { error } = await supabase.from('event_attendees').upsert(payload);
  return { error };
}

/** AdminReview.tsx — count news_articles in quality review. */
export async function fetchNewsQualityReviewCount(): Promise<number> {
  const { count, error } = await supabase
    .from('news_articles')
    .select('id', { count: 'exact', head: true })
    .eq('quality_status', 'review');
  return error ? 0 : (count ?? 0);
}

/** AdminReview.tsx — count entity_link_review pending rows. */
export async function fetchEntityLinkReviewCount(): Promise<number> {
  // entity_link_review isn't in the generated supabase types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from('entity_link_review')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  return error ? 0 : (count ?? 0);
}

/** EventDetail.parts.tsx — slug→uuid fallback + attendees fetch. */
export async function fetchEventBySlugOrId<T extends { id: string }>(
  slug: string,
  selectFields: string,
  userId: string | undefined,
): Promise<(T & { event_attendees: unknown[] }) | null> {
  let { data, error } = await supabase
    .from('events')
    .select(selectFields)
    .eq('slug', slug)
    .single();
  if (error && /uuid|invalid|no rows/i.test(error.message || '')) {
    const fb = await supabase.from('events').select(selectFields).eq('id', slug).single();
    data = fb.data;
    error = fb.error;
  }
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null;
    throw error;
  }
  if (!data) return null;
  const event = data as T;
  if (userId) {
    const { data: attendeesData } = await supabase
      .from('event_attendees')
      .select(`id, status, user_id, profiles:user_id (display_name, avatar_url)`)
      .eq('event_id', event.id);
    return { ...event, event_attendees: attendeesData ?? [] };
  }
  return { ...event, event_attendees: [] };
}

/** PersonalityDetail.parts.tsx — public personality by slug, then by id. */
export async function fetchPublicPersonalityBySlugOrId<T = unknown>(
  slugOrId: string,
): Promise<T | null> {
  let { data, error } = await supabase
    .from('personalities')
    .select('*')
    .eq('slug', slugOrId)
    .eq('visibility', 'public')
    .maybeSingle();
  if (!data && !error) {
    const fb = await supabase
      .from('personalities')
      .select('*')
      .eq('id', slugOrId)
      .eq('visibility', 'public')
      .maybeSingle();
    data = fb.data;
    error = fb.error;
  }
  if (error) throw error;
  return (data ?? null) as T | null;
}

/** VenueDetail.parts.tsx — venue by slug + uuid + website domain fallback,
 * plus reviews. Returns redirectTo when website-domain match succeeds. */
export async function fetchVenueWithReviews<TVenue, TReview>(
  slug: string,
  selectFields: string,
): Promise<{
  venue: TVenue | null;
  reviews: TReview[];
  redirectTo?: string;
  notFound?: boolean;
}> {
  let { data: venueData, error: venueError } = await supabase
    .from('venues')
    .select(selectFields)
    .eq('slug', slug)
    .single();
  if (venueError && /uuid|invalid|no rows/i.test(venueError.message || '')) {
    const fb = await supabase.from('venues').select(selectFields).eq('id', slug).single();
    venueData = fb.data;
    venueError = fb.error;
  }
  if (venueError && /\./.test(slug) && !/\s/.test(slug)) {
    const host = slug.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    if (host) {
      const { data: byWebsite } = await supabase
        .from('venues')
        .select('slug, id')
        .or(`website.ilike.%${host}%,website.ilike.%www.${host}%`)
        .limit(1)
        .maybeSingle();
      const w = byWebsite as { slug?: string; id?: string } | null;
      if (w?.slug || w?.id) {
        return { venue: null, reviews: [], redirectTo: `/venues/${w.slug || w.id}` };
      }
    }
  }
  if (venueError) {
    if (
      /no rows|not found|0 rows/i.test(venueError.message || '') ||
      (venueError as { code?: string }).code === 'PGRST116'
    ) {
      return { venue: null, reviews: [], notFound: true };
    }
    throw venueError;
  }
  if (!venueData) return { venue: null, reviews: [], notFound: true };
  const venue = venueData as TVenue & { id: string };
  const { data: reviewsData, error: reviewsError } = await supabase
    .from('venue_reviews')
    .select(`*, profiles:user_id (display_name, avatar_url)`)
    .eq('venue_id', venue.id)
    .order('created_at', { ascending: false });
  if (reviewsError) throw reviewsError;
  return { venue: venue as TVenue, reviews: (reviewsData ?? []) as TReview[] };
}

/** admin/EmailTemplates.tsx — list + upsert email templates. */
export async function fetchEmailTemplates() {
  const { data, error } = await supabase.from('email_templates').select('*').order('name');
  return { data: data ?? [], error };
}

export async function upsertEmailTemplate(
  template: Record<string, unknown>,
  editingId: string | null,
) {
  if (editingId) {
    const { error } = await supabase
      .from('email_templates')
      .update(template as never)
      .eq('id', editingId);
    return { error };
  }
  const { error } = await supabase.from('email_templates').insert([template] as never);
  return { error };
}

/** Ressources.tsx — list distinct profession values. */
export async function fetchAllProfessions(): Promise<string[]> {
  const { data } = await supabase.from('personalities').select('profession').not('profession', 'is', null);
  if (!data) return [];
  return [...new Set((data as Array<{ profession?: string }>).map((p) => p.profession).filter(Boolean))].sort() as string[];
}

/** Ressources.tsx — fetch tag by name + category assignments + parent names. */
export async function fetchTagWithCategories(name: string) {
  const { data } = await supabase
    .from('unified_tags')
    .select('*')
    .ilike('name', name)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const tag = data as { id: string };
  const { data: catAssignments } = await supabase
    .from('tag_category_assignments')
    .select('tag_id, category_id, is_primary, tag_categories(id, name, slug, level, parent_id)')
    .eq('tag_id', tag.id);

  type Cat = {
    id: string;
    name: string;
    slug: string;
    level: number;
    parent_id: string | null;
    parent_name: string | null;
    is_primary: boolean;
  };
  const cats: Cat[] = (catAssignments ?? [])
    .map((a) => {
      const c = (a as { tag_categories?: Cat | null }).tag_categories;
      return c
        ? {
            id: c.id,
            name: c.name,
            slug: c.slug,
            level: c.level,
            parent_id: c.parent_id,
            parent_name: null,
            is_primary: (a as { is_primary?: boolean }).is_primary ?? false,
          }
        : null;
    })
    .filter((c): c is Cat => c !== null);

  if (cats.length > 0) {
    const parentIds = cats.filter((c) => c.parent_id).map((c) => c.parent_id as string);
    if (parentIds.length > 0) {
      const { data: parents } = await supabase
        .from('tag_categories')
        .select('id, name')
        .in('id', parentIds);
      const pm = new Map(((parents ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
      cats.forEach((c) => {
        if (c.parent_id) c.parent_name = pm.get(c.parent_id) || null;
      });
    }
  }
  return { ...data, categories: cats };
}

/** AdminSubmissions.tsx — promote a submission to its target table. */
export async function insertEntityFromSubmission(
  table: string,
  payload: Record<string, unknown>,
): Promise<{ data: { id: string } | null; error: Error | null }> {
  const { data, error } = await supabase
    .from(table as never)
    .insert(payload as never)
    .select('id')
    .single();
  return {
    data: (data as { id: string } | null) ?? null,
    error: error as Error | null,
  };
}

/** AdminSubmissions.tsx — update a submission row (approve/reject side effects). */
export async function updateCommunitySubmission(
  id: string,
  update: Record<string, unknown>,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('community_submissions' as const)
    .update(update as never)
    .eq('id', id);
  return { error: error as Error | null };
}

/** AdminSubmissions.tsx — append audit rows. */
export async function insertCommunitySubmissionAudit(
  rows: Array<Record<string, unknown>>,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('community_submissions_audit').insert(rows as never);
  return { error: error as Error | null };
}

/** NewsDetail.tsx — categories list. */
export async function fetchNewsCategories<T = unknown>(): Promise<T[]> {
  const { data } = await supabase
    .from('news_categories')
    .select('slug, name, color')
    .eq('is_active', true);
  return (data ?? []) as T[];
}

/** NewsDetail.tsx — article by slug then by id, scoped to non-rejected. */
export async function fetchNewsArticleBySlugOrId<T = unknown>(slug: string): Promise<T | null> {
  let { data, error } = await supabase
    .from('news_articles')
    .select('*')
    .eq('slug', slug)
    .is('duplicate_of_id', null)
    .not('content', 'is', null)
    .neq('content', '')
    .or('quality_score.is.null,quality_score.gte.50')
    .or('quality_status.is.null,quality_status.eq.passed')
    .maybeSingle();
  if (!data && !error) {
    const fb = await supabase
      .from('news_articles')
      .select('*')
      .eq('id', slug)
      .is('duplicate_of_id', null)
      .not('content', 'is', null)
      .neq('content', '')
      .or('quality_score.is.null,quality_score.gte.50')
      .or('quality_status.is.null,quality_status.eq.passed')
      .maybeSingle();
    data = fb.data;
    error = fb.error;
  }
  if (error) return null;
  return (data ?? null) as T | null;
}

/** NewsDetail.tsx — source name + url by id. */
export async function fetchNewsSourceById(id: string): Promise<{ name?: string; url?: string } | null> {
  const { data } = await supabase
    .from('news_sources')
    .select('name, url')
    .eq('id', id)
    .maybeSingle();
  return (data as { name?: string; url?: string } | null) ?? null;
}

/** NewsDetail.tsx — tags assigned to a news entity. */
export async function fetchNewsTagsForEntity(entityId: string): Promise<string[]> {
  const { data } = await supabase
    .from('unified_tag_assignments')
    .select('unified_tags!inner(name)')
    .eq('entity_type', 'news')
    .eq('entity_id', entityId);
  return (
    (data as Array<{ unified_tags: { name: string } }> | null)?.map((t) => t.unified_tags.name) ??
    []
  );
}

/** NewsDetail.tsx — related articles in same canonical category, falling back to legacy. */
export async function fetchRelatedNewsArticles<T = unknown>(
  category: string,
  excludeId: string,
): Promise<T[]> {
  const { data } = await supabase
    .from('news_articles')
    .select('id, slug, title, excerpt, image_url, published_at, category, category_canonical')
    .or(`category_canonical.eq.${category},category.eq.${category}`)
    .neq('id', excludeId)
    .is('duplicate_of_id', null)
    .not('published_at', 'is', null)
    .not('content', 'is', null)
    .neq('content', '')
    .or('quality_score.is.null,quality_score.gte.50')
    .or('quality_status.is.null,quality_status.eq.passed')
    .order('published_at', { ascending: false })
    .limit(4);
  return (data ?? []) as T[];
}

/** MarketplaceItemDetail.tsx — slug→uuid fallback + reviews + favorite state. */
export async function fetchMarketplaceListingBundle<TListing, TReview>(
  slug: string,
  userId: string | undefined,
): Promise<{ listing: TListing; reviews: TReview[]; isFavorited: boolean } | null> {
  let { data: listing, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('slug', slug)
    .single();
  if (error && /uuid|invalid|no rows/i.test(error.message || '')) {
    const fb = await supabase.from('marketplace_listings').select('*').eq('id', slug).single();
    listing = fb.data;
    error = fb.error;
  }
  if (error) {
    if ((error as { code?: string }).code === 'PGRST116') return null;
    throw error;
  }
  if (!listing) return null;
  const typed = listing as TListing & { id: string };
  const { data: reviews, error: reviewsError } = await supabase
    .from('marketplace_reviews')
    .select(`*, profiles:user_id (display_name, avatar_url)`)
    .eq('listing_id', typed.id)
    .order('created_at', { ascending: false });
  if (reviewsError) throw reviewsError;
  let isFavorited = false;
  if (userId) {
    const { data: fav } = await supabase
      .from('marketplace_favorites')
      .select('id')
      .eq('listing_id', typed.id)
      .eq('user_id', userId)
      .maybeSingle();
    isFavorited = !!fav;
  }
  return {
    listing: typed,
    reviews: (reviews ?? []) as TReview[],
    isFavorited,
  };
}

/** MarketplaceItemDetail.tsx — toggle marketplace favorite. */
export async function toggleMarketplaceFavorite(
  listingId: string,
  userId: string,
  isFavorited: boolean,
) {
  if (isFavorited) {
    const { error } = await supabase
      .from('marketplace_favorites')
      .delete()
      .eq('listing_id', listingId)
      .eq('user_id', userId);
    return { error };
  }
  const { error } = await supabase
    .from('marketplace_favorites')
    .insert({ listing_id: listingId, user_id: userId } as never);
  return { error };
}

/** FeedbackBoard.tsx — list non-spam feedback submissions. */
export async function fetchFeedbackBoardItems<T = unknown>(): Promise<T[]> {
  const { data, error } = await supabase
    .from('community_submissions' as const)
    .select('id,data,submitted_at,feedback_status')
    .eq('content_type', 'feedback')
    .or('is_spam.is.null,is_spam.eq.false')
    .is('duplicate_of', null)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as T[];
}

/** FeedbackBoard.tsx — toggle a feedback vote. */
export async function toggleFeedbackVote(
  submissionId: string,
  userId: string,
  hasVoted: boolean,
) {
  if (hasVoted) {
    await supabase
      .from('feedback_votes' as const)
      .delete()
      .eq('submission_id', submissionId)
      .eq('user_id', userId);
  } else {
    await supabase
      .from('feedback_votes' as const)
      .insert({ submission_id: submissionId, user_id: userId } as never);
  }
}

/** NotificationList — fetch likes + comments on a user's posts. */
export async function fetchUserPostInteractions<TLike, TComment>(
  userId: string,
): Promise<{ likes: TLike[]; comments: TComment[] }> {
  const { data: posts } = await supabase
    .from('community_posts')
    .select('id')
    .eq('user_id', userId)
    .limit(200);
  const postIds = (posts ?? []).map((p) => p.id);
  if (postIds.length === 0) return { likes: [] as TLike[], comments: [] as TComment[] };

  const { data: likesData } = await supabase
    .from('post_likes')
    .select('id, post_id, user_id, created_at')
    .in('post_id', postIds)
    .order('created_at', { ascending: false })
    .limit(20);

  let likes: TLike[] = [];
  if (likesData?.length) {
    const likerIds = [...new Set(likesData.map((l) => l.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', likerIds);
    likes = likesData.map((l) => {
      const p = (profiles ?? []).find((x) => x.user_id === l.user_id);
      return {
        id: l.id,
        post_id: l.post_id,
        user_id: l.user_id,
        created_at: l.created_at,
        user_display_name: p?.display_name || 'Someone',
        user_avatar_url: p?.avatar_url || null,
      } as unknown as TLike;
    });
  }

  const { data: commentsData } = await supabase
    .from('post_comments')
    .select(`id, post_id, user_id, content, created_at, profiles ( display_name, avatar_url, user_id )`)
    .in('post_id', postIds)
    .order('created_at', { ascending: false })
    .limit(20);
  const comments: TComment[] = (commentsData ?? []).map((c: Record<string, unknown> & { profiles?: { display_name?: string; avatar_url?: string } }) => ({
    id: c.id,
    post_id: c.post_id,
    user_id: c.user_id,
    content: c.content,
    created_at: c.created_at,
    user_display_name: c.profiles?.display_name || 'Someone',
    user_avatar_url: c.profiles?.avatar_url || null,
  } as unknown as TComment));

  return { likes, comments };
}

/** ReviewQueueTab — list pending review items, optional target_table filter. */
export async function fetchReviewQueueItems<T = unknown>(
  filter: { targetTable?: string; dedupStatus?: string },
): Promise<T[]> {
  let q = supabase
    .from('ingestion_staging')
    .select(
      'id, source_type, source_name, target_table, entity_type, ai_validation_result, ai_confidence_score, dedup_status, dedup_match_id, dedup_match_score, dedup_details, normalized_data, review_status, created_at',
    )
    .eq('review_status', 'pending_review')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filter.targetTable) q = q.eq('target_table', filter.targetTable);
  if (filter.dedupStatus) q = q.eq('dedup_status', filter.dedupStatus);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

/** AdminFeedback controller — bulk update by id list. */
export async function updateCommunitySubmissionsByIds(
  ids: string[],
  update: Record<string, unknown>,
): Promise<{ error: Error | null }> {
  if (ids.length === 0) return { error: null };
  const { error } = await supabase
    .from('community_submissions')
    .update(update as never)
    .in('id', ids);
  return { error: error as Error | null };
}

/** AdminFeedback controller — list community submissions filtered by content_type. */
export async function listCommunitySubmissionsByType<T = unknown>(
  contentType: string,
  columns: string,
  orderCol = 'submitted_at',
): Promise<T[]> {
  const { data, error } = await supabase
    .from('community_submissions')
    .select(columns as never)
    .eq('content_type', contentType)
    .order(orderCol, { ascending: false });
  if (error) throw error;
  return (data ?? []) as T[];
}

/** Generic CRUD helpers — last-resort wrappers when a more specific hook is overkill. */
export async function listFrom<T = unknown>(
  table: string,
  select = '*',
  order?: { col: string; ascending?: boolean },
  limit?: number,
): Promise<T[]> {
  let q = supabase.from(table as never).select(select as never);
  if (order) q = (q as unknown as { order: (c: string, opts: { ascending?: boolean }) => typeof q }).order(order.col, { ascending: order.ascending ?? true });
  if (limit) q = (q as unknown as { limit: (n: number) => typeof q }).limit(limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

/** Count rows in a table — used by data-viz dashboards. */
export async function countRows(
  table: string,
  filter?: { col: string; op?: 'eq' | 'neq' | 'gte' | 'lte'; val: unknown },
): Promise<number> {
  let q = supabase.from(table as never).select('*', { count: 'exact', head: true });
  if (filter) {
    const op = filter.op ?? 'eq';
    q = (q as unknown as Record<string, (c: string, v: unknown) => typeof q>)[op](
      filter.col,
      filter.val,
    );
  }
  const { count, error } = await q;
  return error ? 0 : (count ?? 0);
}

/** listFrom with one or more `eq` filters. */
export async function listFromWhere<T = unknown>(
  table: string,
  select: string,
  filters: Array<{ col: string; val: unknown; op?: 'eq' | 'neq' | 'in' | 'gte' | 'lte' }>,
  opts?: { order?: { col: string; ascending?: boolean }; limit?: number },
): Promise<T[]> {
  let q = supabase.from(table as never).select(select as never);
  for (const f of filters) {
    const op = f.op ?? 'eq';
    q = (
      q as unknown as Record<string, (c: string, v: unknown) => typeof q>
    )[op](f.col, f.val);
  }
  if (opts?.order) {
    q = (
      q as unknown as { order: (c: string, opts: { ascending?: boolean }) => typeof q }
    ).order(opts.order.col, { ascending: opts.order.ascending ?? true });
  }
  if (opts?.limit) {
    q = (q as unknown as { limit: (n: number) => typeof q }).limit(opts.limit);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

/** Update many rows by id list — generic for any table. */
export async function updateRowsByIds(
  table: string,
  ids: string[],
  update: Record<string, unknown>,
): Promise<{ error: Error | null }> {
  if (ids.length === 0) return { error: null };
  const { error } = await supabase
    .from(table as never)
    .update(update as never)
    .in('id', ids);
  return { error: error as Error | null };
}

/** Like listFrom but with an `.in(col, values)` filter. */
export async function listFromIn<T = unknown>(
  table: string,
  select: string,
  col: string,
  values: unknown[],
): Promise<T[]> {
  if (values.length === 0) return [];
  const { data } = await supabase
    .from(table as never)
    .select(select as never)
    .in(col as never, values as never);
  return (data ?? []) as T[];
}

export async function insertInto<TPayload extends Record<string, unknown>>(
  table: string,
  payload: TPayload,
): Promise<{ data: unknown; error: unknown }> {
  const { data, error } = await supabase.from(table as never).insert([payload as never]).select().maybeSingle();
  return { data, error };
}

export async function updateRow(
  table: string,
  id: string,
  update: Record<string, unknown>,
): Promise<{ error: unknown }> {
  const { error } = await supabase.from(table as never).update(update as never).eq('id', id);
  return { error };
}

export async function deleteRow(table: string, id: string): Promise<{ error: unknown }> {
  const { error } = await supabase.from(table as never).delete().eq('id', id);
  return { error };
}

/** AdminQueerVillages.tsx — list cities + countries. */
export async function fetchAllCitiesAndCountries() {
  const [citiesRes, countriesRes] = await Promise.all([
    supabase.from('cities').select('id, name, slug'),
    supabase.from('countries').select('id, name'),
  ]);
  return {
    cities: (citiesRes.data ?? []) as Array<{ id: string; name: string; slug?: string }>,
    countries: (countriesRes.data ?? []) as Array<{ id: string; name: string }>,
  };
}

/** AdminCountries.tsx — delete a country row. */
export async function deleteCountry(id: string) {
  const { error } = await supabase.from('countries').delete().eq('id', id);
  return { error };
}

/** AdminCountries.tsx — update a country row. */
export async function updateCountry(id: string, update: Record<string, unknown>) {
  const { error } = await supabase.from('countries').update(update as never).eq('id', id);
  return { error };
}

/** Friends.tsx — fetch profiles by user_id list. */
export async function fetchProfilesByUserIds<T = unknown>(userIds: string[]): Promise<T[]> {
  if (userIds.length === 0) return [];
  const { data } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_url, location')
    .in('user_id', userIds);
  return (data ?? []) as T[];
}

/** News.tsx — bulk lookup helper for cities/countries by id list. */
export async function fetchNamesByIds(
  table: 'cities' | 'countries',
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await supabase.from(table).select('id, name').in('id', ids);
  const map: Record<string, string> = {};
  (data ?? []).forEach((c: { id: string; name: string }) => {
    map[c.id] = c.name;
  });
  return map;
}

/** AdminPersonalities.tsx — read internal note for a personality. */
export async function fetchPersonalityInternalNote(personalityId: string): Promise<string | null> {
  const { data } = await supabase
    .from('personality_internal_notes' as never)
    .select('notes')
    .eq('personality_id' as never, personalityId as never)
    .maybeSingle();
  return ((data as { notes?: string } | null)?.notes as string | undefined) ?? null;
}

/** AdminPersonalities.tsx — upsert internal note. */
export async function upsertPersonalityInternalNote(payload: {
  personality_id: string;
  notes: string;
  updated_by?: string | null;
}) {
  const { error } = await supabase
    .from('personality_internal_notes' as never)
    .upsert(payload as never, { onConflict: 'personality_id' });
  return { error };
}

/** Favorites.tsx — fetch all favorite types for a user in parallel. */
export async function fetchAllUserFavorites(userId: string) {
  const [venueFavs, eventFavs, marketplaceFavs, newsFavs] = await Promise.all([
    supabase.from('venue_favorites').select('venue_id').eq('user_id', userId),
    supabase.from('event_favorites').select('event_id').eq('user_id', userId),
    supabase.from('marketplace_favorites').select('listing_id').eq('user_id', userId),
    supabase.from('news_favorites').select('article_id').eq('user_id', userId),
  ]);
  const venueIds = venueFavs.data?.map((f) => f.venue_id) ?? [];
  const eventIds = eventFavs.data?.map((f) => f.event_id) ?? [];
  const listingIds = marketplaceFavs.data?.map((f) => f.listing_id) ?? [];
  const articleIds = newsFavs.data?.map((f) => f.article_id) ?? [];

  const [venueData, eventData, marketplaceData, newsData] = await Promise.all([
    venueIds.length
      ? supabase
          .from('venues')
          .select('id, slug, name, description, image_url, location, rating, category')
          .in('id', venueIds)
      : Promise.resolve({ data: [] as unknown[] }),
    eventIds.length
      ? supabase
          .from('events')
          .select(
            'id, slug, title, description, images, city, state, country, start_date, price_min, event_type',
          )
          .in('id', eventIds)
      : Promise.resolve({ data: [] as unknown[] }),
    listingIds.length
      ? supabase
          .from('marketplace_listings')
          .select('id, slug, title, description, images, location, price, category, business_name')
          .in('id', listingIds)
      : Promise.resolve({ data: [] as unknown[] }),
    articleIds.length
      ? supabase
          .from('news_articles')
          .select('id, slug, title, excerpt, image_url, category, published_at, views_count')
          .in('id', articleIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  return {
    venues: (venueData.data ?? []) as Array<Record<string, unknown>>,
    events: (eventData.data ?? []) as Array<Record<string, unknown>>,
    marketplace: (marketplaceData.data ?? []) as Array<Record<string, unknown>>,
    news: (newsData.data ?? []) as Array<Record<string, unknown>>,
  };
}

/** Insert a row, optionally returning the inserted id. */
export async function insertReturningId(
  table: string,
  payload: Record<string, unknown>,
): Promise<{ id: string | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from(table as never)
    .insert(payload as never)
    .select('id')
    .single();
  return {
    id: ((data as { id?: string } | null) ?? null)?.id ?? null,
    error: error ? { message: error.message } : null,
  };
}

/** Search unified_tags by name (ilike) — admin search-intelligence. */
export async function searchUnifiedTagsByName<T = unknown>(q: string): Promise<T[]> {
  const { data } = await supabase
    .from('unified_tags')
    .select('id, name, slug')
    .ilike('name', `%${q}%`)
    .eq('status', 'active')
    .is('merged_into_id', null)
    .limit(15);
  return (data ?? []) as T[];
}

/** Update rows matching one eq filter (not necessarily id). */
export async function updateRowsBy(
  table: string,
  match: { col: string; val: unknown },
  update: Record<string, unknown>,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from(table as never)
    .update(update as never)
    .eq(match.col, match.val);
  return { error: error ? { message: error.message } : null };
}

/** List rows where a column is not null. */
export async function listWhereNotNull<T = unknown>(
  table: string,
  select: string,
  notNullCol: string,
  orderCol?: string,
): Promise<T[]> {
  let q = supabase.from(table as never).select(select as never).not(notNullCol, 'is', null);
  if (orderCol) {
    q = (q as unknown as { order: (c: string) => typeof q }).order(orderCol);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

/** Delete many rows by id list — generic for any table. */
export async function deleteRowsByIds(
  table: string,
  ids: string[],
): Promise<{ error: { message: string } | null }> {
  if (ids.length === 0) return { error: null };
  const { error } = await supabase
    .from(table as never)
    .delete()
    .in('id', ids);
  return { error: error ? { message: error.message } : null };
}

/** Insert multiple rows. */
export async function insertRows(
  table: string,
  rows: Array<Record<string, unknown>>,
): Promise<{ error: { message: string } | null }> {
  if (rows.length === 0) return { error: null };
  const { error } = await supabase.from(table as never).insert(rows as never);
  return { error: error ? { message: error.message } : null };
}

/** Insert without expecting a return. */
export async function insertRow(
  table: string,
  payload: Record<string, unknown>,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase.from(table as never).insert(payload as never);
  return { error: error ? { message: error.message } : null };
}

/** Count rows matching multiple eq filters. */
export async function countRowsWhere(
  table: string,
  filters: Array<{ col: string; val: unknown }>,
): Promise<number> {
  let q = supabase.from(table as never).select('id', { count: 'exact', head: true });
  for (const f of filters) {
    q = (q as unknown as { eq: (c: string, v: unknown) => typeof q }).eq(f.col, f.val);
  }
  const { count, error } = await q;
  return error ? 0 : (count ?? 0);
}

/** Fetch one row by id. */
export async function fetchById<T = unknown>(
  table: string,
  id: string,
  select = '*',
): Promise<T | null> {
  const { data } = await supabase
    .from(table as never)
    .select(select as never)
    .eq('id', id)
    .single();
  return (data as T | null) ?? null;
}

/** AudioManager + VideoManager — list rows with one nested join, ordered desc. */
export async function listWithJoinDesc<T = unknown>(
  table: string,
  selectClause: string,
  orderCol = 'created_at',
): Promise<T[]> {
  const { data, error } = await supabase
    .from(table as never)
    .select(selectClause as never)
    .order(orderCol, { ascending: false });
  if (error) throw error;
  return (data ?? []) as T[];
}

/** AdminReview.tsx — count rows matching a single filter (or all). */
export function useReviewCount(table: string, filterCol?: string, filterVal?: string) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      type CountResult = { count: number | null; error: unknown };
      const base = supabase.from(table as never).select('id', { count: 'exact', head: true });
      const filtered =
        filterCol && filterVal !== undefined
          ? (base as unknown as { eq: (c: string, v: unknown) => Promise<CountResult> }).eq(
              filterCol,
              filterVal,
            )
          : (base as unknown as Promise<CountResult>);
      const { count: c, error } = await filtered;
      if (!cancelled) {
        setCount(error ? 0 : (c ?? 0));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [table, filterCol, filterVal]);
  return { count, loading };
}
