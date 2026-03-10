import { useQuery } from '@tanstack/react-query';
import { api } from '@/integrations/api/client';

export interface TagVenue {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  category: string | null;
  image_url: string | null;
  foursquare_rating: number | null;
  address: string | null;
}

export interface TagNewsArticle {
  id: string;
  title: string;
  published_at: string | null;
  image_url: string | null;
  excerpt: string | null;
  url: string | null;
  news_sources: { name: string } | null;
}

export interface TagEvent {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  country: string | null;
  venue_name: string | null;
  image_url: string | null;
  event_type: string | null;
}

export interface TagPersonality {
  id: string;
  name: string;
  profession: string | null;
  nationality: string | null;
  image_url: string | null;
  birth_date: string | null;
  death_date: string | null;
}

export interface TagGroup {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  member_count: number | null;
  privacy: string | null;
}

export interface TagContentResult {
  venues: TagVenue[];
  news: TagNewsArticle[];
  events: TagEvent[];
  personalities: TagPersonality[];
  groups: TagGroup[];
}

// Helper: generate the slug form of a tag name (e.g. "Gay Bar" -> "gay-bar")
function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Fetch all linked content for a tag via a single RPC call.
 * The server-side function handles text[] array matching with the PostgreSQL
 * && (overlap) operator, bypassing PostgREST URL-encoding issues with
 * .contains() / .overlaps() on text[] columns.
 */
async function fetchTagContent(tagId: string, tagName: string): Promise<TagContentResult> {
  const slug = toSlug(tagName);

  const { data, error } = await api.rpc('get_tag_linked_content', {
    p_tag_id: tagId,
    p_tag_name: tagName,
    p_tag_slug: slug,
    p_limit: 20,
  });

  if (error || !data) {
    console.error('Error fetching tag content via RPC:', error);
    return { venues: [], news: [], events: [], personalities: [], groups: [] };
  }

  // The RPC returns a JSON object matching TagContentResult shape
  return data as TagContentResult;
}

export function useTagContent(tagId: string | undefined, tagName: string | undefined) {
  return useQuery({
    queryKey: ['tag-content', tagId, tagName],
    queryFn: () => fetchTagContent(tagId!, tagName!),
    enabled: !!tagId && !!tagName,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });
}
