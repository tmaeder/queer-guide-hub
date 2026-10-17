import { useCallback, useEffect, useState } from 'react';
import { untypedFrom } from '@/integrations/supabase/untyped';
import type { FieldConfig, SelectOption } from '@/types/cms';

type Source = NonNullable<FieldConfig['dynamicOptions']>;
export interface ManagedOption extends SelectOption {
  active: boolean;
  data?: Record<string, unknown>;
}
const cache = new Map<string, { expires: number; request: Promise<ManagedOption[]> }>();
const changed = 'taxonomy-options-changed';

export function invalidateManagedOptions() {
  cache.clear();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(changed));
}

export async function fetchManagedOptions(source: Source): Promise<ManagedOption[]> {
  const key = JSON.stringify(source);
  const sensitive = ['kink_categories', 'kink_items'].includes(source.table);
  const existing = sensitive ? undefined : cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.request;
  const request = (async () => {
    const options: ManagedOption[] = [];
    // PostgREST's response cap must not silently truncate a large vocabulary.
    for (let offset = 0; ; offset += 500) {
      const columns = [
        ...new Set(
          [
            source.valueColumn,
            source.labelColumn,
            source.activeColumn,
            ...(source.extraColumns ?? []),
          ].filter(Boolean),
        ),
      ].join(',');
      let query = untypedFrom(source.table)
        .select(columns)
        .order(source.orderBy ?? source.labelColumn)
        .order(source.valueColumn)
        .range(offset, offset + 499);
      for (const [column, value] of Object.entries(source.filters ?? {}))
        query = query.eq(column, value);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      for (const row of rows) {
        if (row[source.valueColumn] == null) continue;
        const rawValue = String(row[source.valueColumn]);
        if (source.valuePrefix && !rawValue.startsWith(source.valuePrefix)) continue;
        options.push({
          value: source.valuePrefix ? rawValue.slice(source.valuePrefix.length) : rawValue,
          label: String(row[source.labelColumn] ?? row[source.valueColumn]),
          active: !source.activeColumn || row[source.activeColumn] === true,
          ...(source.extraColumns?.length ? { data: row } : {}),
        });
      }
      if (rows.length < 500) return options;
    }
  })();
  if (!sensitive) cache.set(key, { request, expires: Date.now() + 60_000 });
  try {
    return await request;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

export function useManagedOptions(source?: Source) {
  const key = JSON.stringify(source);
  const [state, setState] = useState<{
    key: string | undefined;
    options: ManagedOption[];
    loading: boolean;
    hasData: boolean;
    error: string | null;
  }>({ key, options: [], loading: !!source, hasData: false, error: null });
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => {
    cache.delete(key);
    setVersion((v) => v + 1);
  }, [key]);
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener(changed, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(changed, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize an external vocabulary request with the current source.
    setState((previous) =>
      previous.key === key
        ? { ...previous, loading: true, error: null }
        : { key, options: [], loading: true, hasData: false, error: null },
    );
    fetchManagedOptions(source)
      .then((options) => {
        if (!cancelled) setState({ key, options, loading: false, hasData: true, error: null });
      })
      .catch(() => {
        if (!cancelled)
          setState((previous) => ({
            ...previous,
            key,
            loading: false,
            error: 'Could not load choices.',
          }));
      });
    return () => {
      cancelled = true;
    };
    // source is represented by a stable serialized key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
  return {
    ...(state.key === key
      ? state
      : { options: [], loading: !!source, hasData: false, error: null }),
    retry,
  };
}

export function classificationSource(taxonomy: string): Source {
  return {
    table: 'taxonomy_terms',
    valueColumn: 'value',
    labelColumn: 'name',
    orderBy: 'sort_order',
    activeColumn: 'is_active',
    filters: { taxonomy },
  };
}

/** Preserve saved inactive/legacy selections without offering them for new choices. */
export function selectableOptions(options: ManagedOption[], value: unknown): SelectOption[] {
  const selected = new Set(Array.isArray(value) ? value : [value]);
  const visible = options
    .filter((o) => o.active || selected.has(o.value))
    .map((o) => ({ value: o.value, label: o.active ? o.label : `${o.label} (inactive)` }));
  for (const item of selected) {
    if (typeof item === 'string' && item && !visible.some((o) => o.value === item))
      visible.push({ value: item, label: `${item} (existing)` });
  }
  return visible;
}

/** Public forms retain the seeded choices when the options service is unavailable. */
export function useClassificationOptions(
  taxonomy: string,
  fallback: SelectOption[],
  value?: unknown,
): SelectOption[] {
  return useVocabularyOptions(classificationSource(taxonomy), fallback, value);
}

export function useVocabularyOptions(
  source: Source,
  fallback: SelectOption[],
  value?: unknown,
): SelectOption[] {
  const { options, loading, error, hasData } = useManagedOptions(source);
  return hasData || (!loading && !error) ? selectableOptions(options, value) : fallback;
}

/** Keep translations for unchanged seeds while allowing managed label edits. */
export function useManagedLabel(
  source: Source,
  value: string | null | undefined,
  fallback: string,
  seedLabel?: string,
): string {
  const { options } = useManagedOptions(value ? source : undefined);
  const term = options.find((option) => option.value === value);
  return term && term.label !== seedLabel ? term.label : fallback;
}
