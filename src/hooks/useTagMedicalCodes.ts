/**
 * Clinical codes for a glossary tag — the "Diagnostic codes" band on /tags/:slug.
 *
 * Reads `get_tag_medical_codes`, which composes the source-site URL server-side
 * from `medical_code_systems.url_template`. The client never builds a link out
 * of a code: the template, the URL key (ICD-11 addresses concepts by numeric
 * foundation id, not by the readable "1C62.3") and the ambiguity rules all live
 * in one place in SQL. A null `url` therefore means "no addressable per-code
 * page exists, or the key was ambiguous", and the caller must render the bare
 * code — never invent a URL to fill the gap.
 *
 * Via `untypedRpc` because the RPC post-dates the generated Database type.
 */

import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';

export const MEDICAL_CODE_GROUPS = [
  'general',
  'specialized',
  'procedural',
  'pharmaceutical',
] as const;

export type MedicalCodeGroup = (typeof MEDICAL_CODE_GROUPS)[number];

export interface MedicalCode {
  system: string;
  label: string;
  code: string;
  /** Composed server-side. Null when no addressable per-code page exists. */
  url: string | null;
  /** The issuing body's own site, used when `url` is null. */
  home_url: string | null;
}

export type TagMedicalCodes = Partial<Record<MedicalCodeGroup, MedicalCode[]>>;

export function useTagMedicalCodes(tagId: string | null) {
  return useQuery({
    queryKey: ['tag-medical-codes', tagId],
    enabled: !!tagId,
    staleTime: 60 * 60 * 1000, // the source refreshes weekly
    queryFn: async (): Promise<TagMedicalCodes> => {
      if (!tagId) return {};
      const { data, error } = await untypedRpc<TagMedicalCodes>('get_tag_medical_codes', {
        p_tag_id: tagId,
      });
      if (error) throw new Error(error.message);
      const doc = (data ?? {}) as TagMedicalCodes;
      // Keep only the known groups and drop empties, so callers can treat a
      // present key as "this group has something to render".
      const out: TagMedicalCodes = {};
      for (const group of MEDICAL_CODE_GROUPS) {
        const items = doc[group];
        if (Array.isArray(items) && items.length > 0) out[group] = items;
      }
      return out;
    },
  });
}

export function countMedicalCodes(codes: TagMedicalCodes | undefined): number {
  if (!codes) return 0;
  return MEDICAL_CODE_GROUPS.reduce((n, group) => n + (codes[group]?.length ?? 0), 0);
}
