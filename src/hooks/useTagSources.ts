import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Legal-instrument citations attached to a glossary tag (admin editor).
 *
 * `tag_sources` also holds ~8,700 rows of a one-off 2026-04-27 wikipedia/wikidata
 * backfill. This hook reads ALL of them for a tag on purpose — the editor should
 * see what is already attached — while the public page filters to `is_public`.
 */

export const LEGAL_SOURCE_TYPES = [
  'statute',
  'treaty',
  'case_law',
  'constitution',
  // A GA resolution is neither a treaty nor a statute — GA res 48/141 created
  // the OHCHR and has to be labellable as what it is.
  'resolution',
] as const;
export type LegalSourceType = (typeof LEGAL_SOURCE_TYPES)[number];

/**
 * Clinical practice guidance a tag's definition is derived from — a named, dated,
 * published document (the UCSF trans care guidelines, the WPATH Standards of Care).
 *
 * Kept apart from LEGAL_SOURCE_TYPES rather than folded into them, because the two
 * publish under different rules and render as different cards. A legal citation
 * needs a jurisdiction; a guideline needs an edition year, because guidance goes
 * stale and how old it is is the reader's first question. Both halves are enforced
 * by `tag_sources_public_requires_citation` — see
 * `supabase/migrations/20261011110300_tag_sources_clinical_guideline.sql`.
 */
export const CLINICAL_SOURCE_TYPES = ['clinical_guideline'] as const;
export type ClinicalSourceType = (typeof CLINICAL_SOURCE_TYPES)[number];

/** Everything a human may publish, as against backfill provenance. */
export const CITABLE_SOURCE_TYPES = [...LEGAL_SOURCE_TYPES, ...CLINICAL_SOURCE_TYPES] as const;

export const INSTRUMENT_STATUSES = [
  'in_force',
  'repealed',
  'superseded',
  'partially_invalidated',
] as const;
export type InstrumentStatus = (typeof INSTRUMENT_STATUSES)[number];

export interface TagSource {
  id: string;
  tag_id: string;
  source_type: string;
  source_url: string | null;
  source_id: string | null;
  claim_summary: string | null;
  official_title: string | null;
  jurisdiction: string | null;
  adopted_year: number | null;
  instrument_status: string | null;
  verified_at: string | null;
  is_public: boolean;
  fetched_at: string | null;
}

export type TagSourceInput = Partial<
  Pick<
    TagSource,
    | 'source_type'
    | 'source_url'
    | 'claim_summary'
    | 'official_title'
    | 'jurisdiction'
    | 'adopted_year'
    | 'instrument_status'
    | 'is_public'
  >
>;

export function useTagSources(tagId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tag-sources', tagId] });
  };

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['tag-sources', tagId],
    queryFn: async (): Promise<TagSource[]> => {
      if (!tagId) return [];
      const { data, error } = await supabase
        .from('tag_sources')
        .select('*')
        .eq('tag_id', tagId)
        .order('is_public', { ascending: false })
        .order('adopted_year', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as TagSource[];
    },
    enabled: !!tagId,
    staleTime: 5 * 60 * 1000,
  });

  const createSource = useMutation({
    mutationFn: async (input: TagSourceInput) => {
      if (!tagId) throw new Error('No tag selected');
      const { data, error } = await supabase
        .from('tag_sources')
        .insert([
          {
            tag_id: tagId,
            source_type: input.source_type ?? 'statute',
            ...input,
            // Stamped only when the row is published, so it reads as "a human
            // checked this URL" rather than "a row existed on this date".
            verified_at: input.is_public ? new Date().toISOString() : null,
          },
        ])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const updateSource = useMutation({
    mutationFn: async ({ id, ...input }: TagSourceInput & { id: string }) => {
      const { data, error } = await supabase
        .from('tag_sources')
        .update({
          ...input,
          ...(input.is_public ? { verified_at: new Date().toISOString() } : {}),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const deleteSource = useMutation({
    mutationFn: async (sourceId: string) => {
      const { error } = await supabase.from('tag_sources').delete().eq('id', sourceId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { sources, isLoading, createSource, updateSource, deleteSource };
}
