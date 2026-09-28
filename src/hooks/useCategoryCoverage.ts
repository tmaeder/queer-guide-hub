import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VenueCategoryCoverage {
  total: number;
  uncategorised: number;
  uncategorised_pct: number | null;
  auto_applied: number;
  awaiting_review: number;
  no_signal: number;
  nonvenue_candidates: number;
  unexamined: number;
}

export interface EventCategoryCoverage {
  total: number;
  uncategorised: number;
  uncategorised_pct: number | null;
  /** Unexamined rows from the gaycities mapper's known-bad concert cohort. */
  concert_bucket_remaining: number;
  reclassified: number;
  /** Explicitly examined rows for which no defensible narrower type exists. */
  terminal_other: number;
  unexamined_concert: number;
}

export interface CategoryRunInfo {
  last_run_at: string | null;
  status: string | null;
  enabled: boolean;
}

export interface CategoryCoverage {
  venues: VenueCategoryCoverage;
  events: EventCategoryCoverage;
  last_runs: Record<string, CategoryRunInfo> | null;
}

/** Coverage + backfill progress for venues.category and events.event_type. */
export function useCategoryCoverage() {
  return useQuery({
    queryKey: ['category-coverage-health'],
    queryFn: async (): Promise<CategoryCoverage> => {
      const { data, error } = await supabase.rpc('category_coverage_health');
      if (error) throw error;
      return data as unknown as CategoryCoverage;
    },
    staleTime: 60_000,
  });
}
