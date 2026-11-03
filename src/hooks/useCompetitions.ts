import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { COMPETITION_CATEGORIES, type CompetitionCategory } from '@/lib/competitionCategories';
import { COMPETED_ANY } from '@/lib/competedInFilter';
import { useReferenceTaxonomy } from '@/hooks/useReferenceTaxonomy';
import type {
  CompetitionGrid,
  CompetitionHistoryEntry,
  CompetitionOverview,
  RosterEntry,
} from '@/types/competition';

/**
 * Data access for the competition spine (Drag Race franchises + the titleholder
 * pageant circuit).
 *
 * RPC-first, following `useMilestones.ts`: the RPCs already filter the
 * personality link to public rows, so nothing here has to remember to.
 *
 * The corpus is static reference data — a season that aired in 2012 does not
 * change — so everything is cached for an hour and fetched WHOLE, then filtered
 * client-side. That is the same strategy `/tags/interactions` and
 * `cities_directory()` use; 1,019 roster rows is well inside the proven ceiling.
 */

const HOUR = 60 * 60_000;

export function useCompetitionOverview() {
  return useQuery({
    queryKey: ['competition-overview'],
    staleTime: HOUR,
    queryFn: async (): Promise<CompetitionOverview> => {
      const { data, error } = await untypedRpc<CompetitionOverview>('competition_overview');
      if (error) throw error;
      return data ?? { competitions: [] };
    },
  });
}

export interface CompetitionCategoryCount {
  competitions: number;
  editions: number;
}

/**
 * Competitions and editions per category, derived from the SAME overview fetch
 * the category pages use. Shared by the /competitions hub and the competition
 * line key on /personalities so the two surfaces can never disagree, and so
 * neither carries a hardcoded "22 competitions" that is wrong the first time an
 * edition is imported.
 *
 * A category with no rows is ABSENT from the map, not zero — callers render
 * `?? 0` once loading is over, so "still counting" and "none" stay distinct.
 */
export function useCompetitionCategoryCounts() {
  const overview = useCompetitionOverview();
  const counts = useMemo(() => {
    const byCategory = new Map<CompetitionCategory, CompetitionCategoryCount>();
    for (const c of overview.data?.competitions ?? []) {
      const current = byCategory.get(c.category) ?? { competitions: 0, editions: 0 };
      current.competitions += 1;
      current.editions += c.editions.length;
      byCategory.set(c.category, current);
    }
    return byCategory;
  }, [overview.data?.competitions]);
  return { counts, isLoading: overview.isLoading, isError: overview.isError };
}

export interface CompetedInOption {
  slug: string;
  name: string;
  category: CompetitionCategory;
  /** Distinct public personalities linked to at least one entry. */
  people: number;
}

/**
 * Options for the "Competed in" filter on /personalities: only competitions
 * that link at least one public personality, so the dropdown never offers a
 * dead end. A separate RPC because the only other source of that answer,
 * `competition_roster()`, is ~130 KB gzipped.
 *
 * Fails SOFT to an empty list: the filter bar still offers "Any competition"
 * and the six categories, which need no counts to be correct.
 */
export function useCompetedInOptions() {
  return useQuery({
    queryKey: ['competition-personality-counts'],
    staleTime: HOUR,
    queryFn: async (): Promise<CompetedInOption[]> => {
      const { data, error } = await untypedRpc<CompetedInOption[]>(
        'competition_personality_counts',
      );
      if (error) {
        console.warn('competition_personality_counts failed:', error.message);
        return [];
      }
      return data ?? [];
    },
  });
}

/**
 * Distinct linked public personalities per competition category, for the
 * "People" links on the /personalities line key, plus the overall distinct
 * count under the key `any` (COMPETED_ANY) for "Any competition". Not derivable by summing
 * `useCompetedInOptions`, because one person can enter several competitions in
 * the same category.
 *
 * Fails SOFT to `null` (unknown), never to an empty map: an empty map would
 * read as "nobody is linked" and hide every People link.
 */
export function useCompetitionCategoryPeople() {
  return useQuery({
    queryKey: ['competition-category-personality-counts'],
    staleTime: HOUR,
    queryFn: async (): Promise<Map<string, number> | null> => {
      const { data, error } = await untypedRpc<{ category: string; people: number }[]>(
        'competition_category_personality_counts',
      );
      if (error) {
        console.warn('competition_category_personality_counts failed:', error.message);
        return null;
      }
      return new Map((data ?? []).map((r) => [r.category, r.people]));
    },
  });
}

export function useCompetitionRoster() {
  return useQuery({
    queryKey: ['competition-roster'],
    staleTime: HOUR,
    queryFn: async (): Promise<RosterEntry[]> => {
      const { data, error } = await untypedRpc<RosterEntry[]>('competition_roster');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * One edition's placement grid. Returns null (not an empty envelope) when the
 * slug does not resolve, so the caller can tell "no such season" from "a season
 * with no grid".
 */
export function useCompetitionGrid(editionSlug: string | undefined) {
  return useQuery({
    queryKey: ['competition-grid', editionSlug],
    enabled: !!editionSlug,
    staleTime: HOUR,
    queryFn: async (): Promise<CompetitionGrid | null> => {
      const { data, error } = await untypedRpc<CompetitionGrid | null>('competition_grid', {
        p_edition_slug: editionSlug,
      });
      if (error) throw error;
      return data ?? null;
    },
  });
}

/** Backs the Drag Race / pageant panel on a personality page. */
export function useCompetitionHistory(personalityId: string | undefined) {
  return useQuery({
    queryKey: ['competition-history', personalityId],
    enabled: !!personalityId,
    staleTime: HOUR,
    queryFn: async (): Promise<CompetitionHistoryEntry[]> => {
      const { data, error } = await untypedRpc<CompetitionHistoryEntry[]>(
        'competition_history_for_personality',
        { p_personality_id: personalityId },
      );
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Primary keys for the competitions on a page, for the staff admin menu only.
 *
 * `competition_overview` returns slugs, not ids, and the admin menu needs the
 * id to address the record. Callers pass `enabled` from the staff check so a
 * public visitor never issues this query.
 */
export function useCompetitionIds(slugs: string[], enabled: boolean) {
  const key = [...slugs].sort();
  return useQuery({
    queryKey: ['competition-ids', key],
    enabled: enabled && key.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('competitions')
        .select('id, slug')
        .in('slug', key);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.slug, r.id]));
    },
  });
}

/** The human label for a `competed` value, for the active-filter chip. */
export function useCompetedInLabel(value: string | undefined): string | undefined {
  useReferenceTaxonomy('competition_category');
  const { t } = useTranslation();
  const { data: options = [] } = useCompetedInOptions();
  if (!value) return undefined;
  if (value === COMPETED_ANY) return t('pages.personalities.competedIn.any', 'Any competition');
  const category = COMPETITION_CATEGORIES.find((c) => c.id === value);
  if (category) return t(category.labelKey, category.label);
  return options.find((o) => o.slug === value)?.name ?? value;
}
