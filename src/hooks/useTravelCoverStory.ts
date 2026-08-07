import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEditorialCover } from './useEditorialCover';
import type { EditorialEntityType } from './useEditorialRails';

export interface TravelCoverStory {
  headline: string;
  pullQuote: string | null;
  author: string | null;
  imageUrl: string | null;
  entityName: string | null;
  href: string | null;
}

const ENTITY_TABLE: Record<EditorialEntityType, 'countries' | 'cities' | 'queer_villages'> = {
  country: 'countries',
  city: 'cities',
  village: 'queer_villages',
};

const ENTITY_PATH: Record<EditorialEntityType, string> = {
  country: '/country',
  city: '/city',
  village: '/villages',
};

/**
 * The current editorial cover, enriched with its entity's slug (covers carry
 * only entity_id, and detail routes are slug-keyed) and the entity image as a
 * hero fallback. Resolves to null when no cover is live — the component
 * self-hides rather than inventing an editorial voice.
 */
export function useTravelCoverStory() {
  const { data: cover, isLoading: coverLoading } = useEditorialCover();

  const entityQuery = useQuery({
    queryKey: ['travel-cover-entity', cover?.entity_type, cover?.entity_id],
    enabled: !!cover,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TravelCoverStory | null> => {
      if (!cover) return null;
      const table = ENTITY_TABLE[cover.entity_type];
      if (!table) return null;
      const { data } = await supabase
        .from(table)
        .select('name, slug, image_url')
        .eq('id', cover.entity_id)
        .maybeSingle();
      const entity = data as { name: string; slug: string | null; image_url: string | null } | null;
      return {
        headline: cover.headline,
        pullQuote: cover.pull_quote,
        author: cover.author,
        imageUrl: cover.hero_image_url ?? entity?.image_url ?? null,
        entityName: entity?.name ?? null,
        href: entity?.slug ? `${ENTITY_PATH[cover.entity_type]}/${entity.slug}` : null,
      };
    },
  });

  return {
    data: cover ? (entityQuery.data ?? null) : null,
    isLoading: coverLoading || (!!cover && entityQuery.isLoading),
  };
}
