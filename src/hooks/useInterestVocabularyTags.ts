import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { INTEREST_SLUGS } from '@/config/interestVocabulary';

export interface InterestTag {
  id: string;
  name: string;
  slug: string;
}

/**
 * Resolve the curated activity vocabulary (config/interestVocabulary) to real
 * `unified_tags` rows.
 *
 * Resolved by SLUG, not by id: the vocabulary is edited as a list of slugs, and
 * a slug that no longer exists simply drops out of the result. The picker then
 * renders a shorter list rather than a chip that cannot be followed, because
 * follow_tag needs an id.
 */
export function useInterestVocabularyTags() {
  return useQuery({
    queryKey: ['interest-vocabulary-tags'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<InterestTag[]> => {
      const { data, error } = await supabase
        .from('unified_tags')
        .select('id, name, slug')
        .in('slug', INTEREST_SLUGS as unknown as string[]);
      if (error) throw error;
      return (data ?? []) as InterestTag[];
    },
  });
}
