import { supabase } from '@/integrations/supabase/client';
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from '@/i18n/languages';
import type { ContentTypeConfig } from '@/types/cms';

export interface DataQualityRow {
  id: string;
  label: string;
  color: string;
  total: number;
  published: number;
  draft: number;
  review: number;
  missingRequired: number;
  staleDays: number;
  staleCount: number;
  untranslated: number;
  expectedTranslations: number;
  error: string | null;
}

export const DATA_QUALITY_STALE_DAYS = 180;

function firstRequiredTextField(config: ContentTypeConfig): string | null {
  const f = config.fields.find(
    (x) => x.required && !x.readOnly && (x.type === 'text' || x.type === 'richtext'),
  );
  return f?.name ?? null;
}

async function headCount(
  table: string,
  build: (q: ReturnType<typeof supabase.from>) => unknown,
): Promise<number> {
  const q = (supabase.from(table as 'events') as ReturnType<typeof supabase.from>).select('*', {
    count: 'exact',
    head: true,
  });
  const result: { count: number | null; error: { message: string } | null } = await (build(
    q,
  ) as Promise<{
    count: number | null;
    error: { message: string } | null;
  }>);
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

export async function loadDataQualityRow(config: ContentTypeConfig): Promise<DataQualityRow> {
  const base: DataQualityRow = {
    id: config.id,
    label: config.label.plural,
    color: config.color,
    total: 0,
    published: 0,
    draft: 0,
    review: 0,
    missingRequired: 0,
    staleDays: DATA_QUALITY_STALE_DAYS,
    staleCount: 0,
    untranslated: 0,
    expectedTranslations: 0,
    error: null,
  };

  try {
    base.total = await headCount(config.tableName, (q) => q);

    const { data: meta } = await supabase
      .from('cms_content_metadata' as 'events')
      .select('workflow_state')
      .eq('source_table', config.tableName);
    if (Array.isArray(meta)) {
      for (const m of meta as { workflow_state: string }[]) {
        if (m.workflow_state === 'published') base.published++;
        else if (m.workflow_state === 'draft') base.draft++;
        else if (m.workflow_state === 'review') base.review++;
      }
    }

    const reqField = firstRequiredTextField(config);
    if (reqField) {
      base.missingRequired = await headCount(config.tableName, (q) =>
        (q as ReturnType<typeof supabase.from>).or(`${reqField}.is.null,${reqField}.eq.`),
      );
    }

    const cutoff = new Date(Date.now() - DATA_QUALITY_STALE_DAYS * 86400_000).toISOString();
    base.staleCount = await headCount('cms_content_metadata', (q) =>
      (q as ReturnType<typeof supabase.from>)
        .eq('source_table', config.tableName)
        .eq('workflow_state', 'published')
        .lt('last_edited_at', cutoff),
    );

    const translatable = config.translatableFields ?? [];
    const nonDefaultLocales = SUPPORTED_LOCALES.filter((l) => l !== DEFAULT_LOCALE);
    if (translatable.length > 0 && base.published > 0) {
      base.expectedTranslations = base.published * translatable.length * nonDefaultLocales.length;
      const { count } = await supabase
        .from('content_translations' as 'events')
        .select('*', { count: 'exact', head: true })
        .eq('table_name', config.tableName);
      const have = count ?? 0;
      base.untranslated = Math.max(0, base.expectedTranslations - have);
    }
  } catch (err) {
    base.error = err instanceof Error ? err.message : 'Failed to load';
  }

  return base;
}
