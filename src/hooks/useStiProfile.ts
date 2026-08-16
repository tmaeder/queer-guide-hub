/**
 * Sexual-health data for a glossary tag — the "Sexual health" and
 * "Myths & facts" bands on /tags/:slug.
 *
 * `get_tag_sti_profile` returns everything one STI tag carries in one round
 * trip (transmission routes worst-first, testing windows, protection methods)
 * or SQL NULL for a non-STI tag — which is how the band self-selects. Ordering
 * comes from `public.sti_risk_rank()` so the band and the full matrix on
 * /tags/sti-guide cannot disagree about what "worst" means.
 *
 * Via `untypedRpc` because the RPCs post-date the generated Database type.
 */

import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

export interface StiTransmissionRoute {
  practice: string;
  label: string;
  group: 'anorectal' | 'oral_touching' | 'chems' | 'vaginal';
  risk: string;
  severity: number;
  blood: boolean;
}

export interface StiTestingWindow {
  test_kind: string;
  sample: string;
  earliest_weeks: number | null;
  symptoms_only: boolean;
  note: string | null;
}

export interface StiProtectionMethod {
  slug: string;
  label: string;
  description: string;
}

export interface StiProfile {
  pathogen: 'virus' | 'bacteria';
  vaccine_note: string | null;
  source: string;
  source_url: string;
  transmission: StiTransmissionRoute[];
  testing: StiTestingWindow[];
  protection: StiProtectionMethod[];
}

export function useStiProfile(tagId: string | null) {
  return useQuery({
    queryKey: ['tag-sti-profile', tagId],
    enabled: !!tagId,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<StiProfile | null> => {
      if (!tagId) return null;
      const { data, error } = await untypedRpc<StiProfile | null>('get_tag_sti_profile', {
        p_tag_id: tagId,
      });
      if (error) throw new Error(error.message);
      return (data as StiProfile | null) ?? null;
    },
  });
}

export interface TagMythFact {
  kind: 'myth' | 'fact';
  claim: string;
  truth: string;
  source: string;
  source_url: string;
}

export function useTagMythFacts(tagId: string | null) {
  return useQuery({
    queryKey: ['tag-myth-facts', tagId],
    enabled: !!tagId,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<TagMythFact[]> => {
      if (!tagId) return [];
      const { data, error } = await untypedRpc<TagMythFact[]>('get_tag_myth_facts', {
        p_tag_id: tagId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as TagMythFact[];
    },
  });
}
