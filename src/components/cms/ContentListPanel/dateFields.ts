import type { ContentTypeConfig, FieldConfig } from '@/types/cms';
import type { ListItem } from './types';

/**
 * Sentinel for "use the record's updated_at". Every ListItem carries it, so the
 * date views work for a type that has no date column of its own rather than
 * refusing to render.
 */
export const UPDATED_AT = '__updated_at__';

/**
 * Columns the date views may plot against. A type may have several (starts_at,
 * ends_at, published_at), so the choice is the user's and persists per type.
 */
export function dateFields(config: ContentTypeConfig | null): FieldConfig[] {
  if (!config) return [];
  return config.fields.filter(
    (f) => !f.hidden && !f.virtual && (f.type === 'date' || f.type === 'datetime'),
  );
}

/**
 * Read the chosen date off a record. Returns null — never a fabricated "now" —
 * when the value is missing or unparseable, so undated records can be reported
 * as undated instead of silently piling onto today.
 */
export function dateOf(item: ListItem, field: string | null): Date | null {
  const raw =
    !field || field === UPDATED_AT
      ? item.updatedAt
      : (item.raw as Record<string, unknown> | undefined)?.[field];

  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local YYYY-MM-DD key. Local, not UTC, so a date lands on the day you see. */
export function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Local YYYY-MM key, used to group the timeline into months. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}`;
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
