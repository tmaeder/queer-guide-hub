import type { ContentTypeConfig, FieldConfig } from '@/types/cms';

/** Placeholder key for records with no value for the grouping column. */
export const UNGROUPED = '__ungrouped__';

/**
 * Columns a board may group by — small, closed value sets only. Grouping by a
 * free-text column would produce one column per record.
 */
export function groupableFields(config: ContentTypeConfig | null): FieldConfig[] {
  if (!config) return [];
  return config.fields.filter(
    (f) => !f.hidden && !f.virtual && (f.type === 'select' || f.type === 'boolean'),
  );
}
