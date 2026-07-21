// Milestones data hooks (queer-history content type). All read via SECURITY
// DEFINER RPCs that self-filter visibility + safety gating server-side.
import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import type {
  Milestone,
  MilestoneAnniversary,
  MilestoneOnThisDay,
  MilestoneRef,
} from '@/types/milestone';

const HOUR = 60 * 60_000;

export interface MilestoneTimelineFilters {
  country?: string | null; // country uuid
  category?: string | null;
  impact?: string | null;
  fromYear?: number | null;
  toYear?: number | null;
}

export function useMilestonesTimeline(filters: MilestoneTimelineFilters = {}, limit = 500) {
  return useQuery({
    queryKey: ['milestones-timeline', filters, limit],
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<Milestone[]>('milestones_timeline', {
        p_from: filters.fromYear ? `${filters.fromYear}-01-01` : null,
        p_to: filters.toYear ? `${filters.toYear}-12-31` : null,
        p_country: filters.country ?? null,
        p_category: filters.category ?? null,
        p_impact: filters.impact ?? null,
        p_significance_min: null,
        p_limit: limit,
        p_offset: 0,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMilestone(slug: string | undefined) {
  return useQuery({
    queryKey: ['milestone', slug],
    enabled: !!slug,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<Milestone | null>('get_milestone', {
        p_slug: slug,
      });
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useMilestonesForEntity(
  entityType: 'personality' | 'event' | 'venue' | 'news' | 'organization',
  entityId: string | undefined,
  limit = 12,
) {
  return useQuery({
    queryKey: ['milestones-for-entity', entityType, entityId, limit],
    enabled: !!entityId,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<MilestoneRef[]>('milestones_for_entity', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_limit: limit,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMilestonesForCountry(countryId: string | undefined, limit = 6) {
  return useQuery({
    queryKey: ['milestones-for-country', countryId, limit],
    enabled: !!countryId,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<MilestoneRef[]>('milestones_for_country', {
        p_country_id: countryId,
        p_limit: limit,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;

export function useMilestonesOnThisDay(limit = 3) {
  const today = dayKey(new Date());
  return useQuery({
    queryKey: ['milestones-on-this-day', today, limit],
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<MilestoneOnThisDay[]>('milestones_on_this_day', {
        p_today: today,
        p_limit: limit,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Calendar "queer history" layer feed (range-capped at 62 days server-side). */
export function useMilestoneAnniversaries(from: Date, to: Date, enabled: boolean) {
  const query = useQuery({
    queryKey: ['calendar-milestones', dayKey(from), dayKey(to)],
    enabled,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<MilestoneAnniversary[]>('milestones_anniversaries', {
        p_from: dayKey(from),
        p_to: dayKey(to),
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { items: query.data ?? [], loading: query.isLoading };
}
