import { useQuery } from '@tanstack/react-query';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';

/**
 * Data + mutations for merging duplicate terms in the 8 settings vocabularies.
 *
 * These are small curated lists (no FKs). Merging de-duplicates the LIST — it
 * captures the dropped label as an alias on the survivor and deactivates the
 * dropped row via merge_vocab_term (reversible). Entity free-text is left alone.
 */

export interface VocabDef {
  key: string;
  label: string;
}
export const VOCABULARIES: VocabDef[] = [
  { key: 'venue_categories', label: 'Venue categories' },
  { key: 'venue_services', label: 'Venue services' },
  { key: 'event_types', label: 'Event types' },
  { key: 'event_amenities', label: 'Event amenities' },
  { key: 'event_services', label: 'Event services' },
  { key: 'accessibility_attributes', label: 'Accessibility' },
  { key: 'target_groups', label: 'Target groups' },
  { key: 'professions', label: 'Professions' },
];

export interface VocabTerm {
  id: string;
  name: string;
  aliases: string[] | null;
}

export function useVocabTerms(vocab: string) {
  return useQuery({
    queryKey: ['vocab-terms', vocab],
    queryFn: async (): Promise<VocabTerm[]> => {
      const { data, error } = await untypedFrom(vocab)
        .select('id, name, aliases')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as VocabTerm[];
    },
  });
}

export interface VocabAudit {
  id: string;
  vocab: string;
  drop_name: string | null;
  created_at: string;
}

export function useVocabRecentMerges() {
  return useQuery({
    queryKey: ['vocab-recent-merges'],
    queryFn: async (): Promise<VocabAudit[]> => {
      const { data, error } = await untypedFrom('vocab_merge_audit')
        .select('id, vocab, drop_name, created_at')
        .is('undone_at', null)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as VocabAudit[];
    },
  });
}

/** Merge the drop term into keep; returns the audit id for undo. */
export async function mergeVocabTerm(
  vocab: string,
  keepId: string,
  dropId: string,
): Promise<string | undefined> {
  const { data, error } = await untypedRpc('merge_vocab_term', {
    p_vocab: vocab,
    p_keep_id: keepId,
    p_drop_id: dropId,
  });
  if (error) throw error;
  return (data as { audit_id?: string } | null)?.audit_id;
}

export async function unmergeVocabTerm(auditId: string): Promise<void> {
  const { error } = await untypedRpc('unmerge_vocab_term', { p_audit_id: auditId });
  if (error) throw error;
}
