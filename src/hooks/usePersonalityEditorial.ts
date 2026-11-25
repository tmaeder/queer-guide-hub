import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { untypedRpc } from '@/integrations/supabase/untyped';
import { baseLanguage, type PersonalityEditorial } from '@/lib/personalityEditorial';

/** One request per visible batch, shared by cards; locale changes invalidate the overlay. */
export function usePersonalityEditorial(ids: string[]) {
  const { i18n } = useTranslation();
  const language = baseLanguage(i18n.resolvedLanguage || i18n.language || 'en');
  const recordIds = [...new Set(ids)].sort();
  const result = useQuery({
    queryKey: ['personality-editorial', recordIds, language],
    enabled: recordIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const rows: PersonalityEditorial[] = [];
      for (let start = 0; start < recordIds.length; start += 100) {
        const { data, error } = await untypedRpc<PersonalityEditorial[]>(
          'personality_public_editorial',
          {
            p_ids: recordIds.slice(start, start + 100),
            p_lang: language,
          },
        );
        if (error) throw error;
        rows.push(...(data ?? []));
      }
      return rows;
    },
    retry: false,
  });
  return new Map((result.data ?? []).map((row) => [row.personality_id, row]));
}
