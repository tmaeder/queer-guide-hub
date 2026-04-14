import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_LOCALE } from '@/i18n/languages';

interface TranslatedContentOptions {
  table: string;
  id: string | undefined;
  fields?: string[];
  enabled?: boolean;
}

export function useTranslatedContent<T extends Record<string, unknown>>({
  table,
  id,
  fields = [],
  enabled = true,
}: TranslatedContentOptions) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const needsTranslation = lang !== DEFAULT_LOCALE;

  return useQuery({
    queryKey: ['content-translation', table, id, lang, fields],
    queryFn: async () => {
      if (!id) return {} as Partial<T>;

      const { data, error } = await supabase.rpc('get_translated_content', {
        p_table: table,
        p_id: id,
        p_lang: lang,
        p_fields: fields.length > 0 ? fields : [],
      });

      if (error) throw error;
      return (data as Partial<T>) || ({} as Partial<T>);
    },
    enabled: enabled && needsTranslation && !!id,
    staleTime: 5 * 60 * 1000,
  });
}

interface TranslatedListOptions {
  table: string;
  ids: string[];
  fields?: string[];
  enabled?: boolean;
}

export function useTranslatedList({
  table,
  ids,
  fields = [],
  enabled = true,
}: TranslatedListOptions) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const needsTranslation = lang !== DEFAULT_LOCALE;

  return useQuery({
    queryKey: ['content-translations-list', table, ids, lang, fields],
    queryFn: async () => {
      if (ids.length === 0) return new Map<string, Record<string, string>>();

      const { data, error } = await supabase.rpc('get_translated_list', {
        p_table: table,
        p_ids: ids,
        p_lang: lang,
        p_fields: fields.length > 0 ? fields : [],
      });

      if (error) throw error;

      const map = new Map<string, Record<string, string>>();
      if (data) {
        for (const row of data as { record_id: string; translations: Record<string, string> }[]) {
          map.set(row.record_id, row.translations);
        }
      }
      return map;
    },
    enabled: enabled && needsTranslation && ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Overlay translations onto an original record.
 * Returns the original value when no translation exists for a field.
 */
export function applyTranslations<T extends Record<string, unknown>>(
  original: T,
  translations: Partial<T> | undefined,
): T {
  if (!translations || Object.keys(translations).length === 0) return original;
  return { ...original, ...translations };
}
