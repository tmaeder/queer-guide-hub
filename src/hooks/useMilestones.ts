// Milestones data hooks (queer-history content type). All read via SECURITY
// DEFINER RPCs that self-filter visibility + safety gating server-side.
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { untypedRpc } from '@/integrations/supabase/untyped';
import type {
  Milestone,
  MilestoneAnniversary,
  MilestoneOnThisDay,
  MilestoneRef,
} from '@/types/milestone';

const HOUR = 60 * 60_000;

/**
 * Content-language overlay: translated title/description rows exist in
 * content_translations (currently 'de' — the curated originals). English is
 * the base column content, so 'en' maps to null (no overlay).
 */
function useContentLang(): string | null {
  const { i18n } = useTranslation();
  const base = (i18n.language || 'en').split('-')[0];
  return base === 'en' ? null : base;
}

export interface MilestoneTimelineFilters {
  country?: string | null; // country uuid
  /** Display-label country match (bulk-imported rows may carry only country_name). */
  countryLabel?: string | null;
  category?: string | null;
  impact?: string | null;
  fromYear?: number | null;
  toYear?: number | null;
  significanceMin?: number | null;
}

export function useMilestonesTimeline(
  filters: MilestoneTimelineFilters = {},
  limit = 500,
  options: { enabled?: boolean } = {},
) {
  const lang = useContentLang();
  return useQuery({
    queryKey: ['milestones-timeline', filters, limit, lang],
    enabled: options.enabled ?? true,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<Milestone[]>('milestones_timeline', {
        p_from: filters.fromYear ? `${filters.fromYear}-01-01` : null,
        p_to: filters.toYear ? `${filters.toYear}-12-31` : null,
        p_country: filters.country ?? null,
        p_country_label: filters.countryLabel ?? null,
        p_category: filters.category ?? null,
        p_impact: filters.impact ?? null,
        p_significance_min: filters.significanceMin ?? null,
        p_limit: limit,
        p_offset: 0,
        p_lang: lang,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface MilestoneYearCount {
  y: number;
  n: number;
}

/** Per-year milestone histogram under the given filters — era counts without row payloads. */
export function useMilestoneYearCounts(
  filters: Pick<MilestoneTimelineFilters, 'countryLabel' | 'category' | 'impact'> = {},
) {
  return useQuery({
    queryKey: ['milestones-year-counts', filters],
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<MilestoneYearCount[]>('milestones_year_counts', {
        p_country_label: filters.countryLabel ?? null,
        p_category: filters.category ?? null,
        p_impact: filters.impact ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMilestone(slug: string | undefined) {
  const lang = useContentLang();
  return useQuery({
    queryKey: ['milestone', slug, lang],
    enabled: !!slug,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<Milestone | null>('get_milestone', {
        p_slug: slug,
        p_lang: lang,
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
  const lang = useContentLang();
  return useQuery({
    queryKey: ['milestones-for-entity', entityType, entityId, limit, lang],
    enabled: !!entityId,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<MilestoneRef[]>('milestones_for_entity', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_limit: limit,
        p_lang: lang,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMilestonesForCountry(countryId: string | undefined, limit = 6) {
  const lang = useContentLang();
  return useQuery({
    queryKey: ['milestones-for-country', countryId, limit, lang],
    enabled: !!countryId,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<MilestoneRef[]>('milestones_for_country', {
        p_country_id: countryId,
        p_limit: limit,
        p_lang: lang,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMilestonesForCity(cityId: string | undefined, limit = 6) {
  const lang = useContentLang();
  return useQuery({
    queryKey: ['milestones-for-city', cityId, limit, lang],
    enabled: !!cityId,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<MilestoneRef[]>('milestones_for_city', {
        p_city_id: cityId,
        p_limit: limit,
        p_lang: lang,
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
  const lang = useContentLang();
  return useQuery({
    queryKey: ['milestones-on-this-day', today, limit, lang],
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<MilestoneOnThisDay[]>('milestones_on_this_day', {
        p_today: today,
        p_limit: limit,
        p_lang: lang,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Calendar "queer history" layer feed (range-capped at 62 days server-side). */
export function useMilestoneAnniversaries(from: Date, to: Date, enabled: boolean) {
  const lang = useContentLang();
  const query = useQuery({
    queryKey: ['calendar-milestones', dayKey(from), dayKey(to), lang],
    enabled,
    staleTime: HOUR,
    queryFn: async () => {
      const { data, error } = await untypedRpc<MilestoneAnniversary[]>('milestones_anniversaries', {
        p_from: dayKey(from),
        p_to: dayKey(to),
        p_lang: lang,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  return { items: query.data ?? [], loading: query.isLoading };
}
