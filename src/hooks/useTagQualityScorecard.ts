import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

export interface TagQualityScorecard {
  active_total: number;
  roles: { article: number; utility: number; entity_redirect: number };
  article: {
    total: number;
    definition_complete: number;
    category_complete: number;
    review_complete: number;
    source_complete: number;
    ontology_complete: number;
    localisation_started: number;
  };
  utility: {
    total: number;
    named: number;
    namespace_owned: number;
    valid_usage: number;
    non_public: number;
  };
  redirect: { total: number; valid_target: number; non_competing: number };
  localisation: Record<string, number>;
  categories: Array<{
    category: string;
    articles: number;
    missing_description: number;
    weak_definition: number;
    sensitive_unreviewed: number;
  }>;
  issues: Record<string, number>;
  sensitive_unreviewed: number;
  oldest_unresolved_at: string | null;
}

/** Role-aware editorial scorecard. Usage is intentionally not a quality dimension. */
export function useTagQualityScorecard() {
  return useQuery<TagQualityScorecard | null>({
    queryKey: ['tag-quality-scorecard-v2'],
    queryFn: async () => {
      const { data, error } = await untypedRpc<TagQualityScorecard>('tag_quality_scorecard_v2');
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}
