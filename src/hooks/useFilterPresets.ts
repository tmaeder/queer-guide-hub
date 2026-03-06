import { useState, useCallback } from 'react';
import type { FilterPreset, AdminTableState } from '@/components/admin/data-table/types';

const MAX_PRESETS = 10;

export function useFilterPresets(tableName: string) {
  const storageKey = `admin-table-presets:${tableName}`;

  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const persist = useCallback(
    (next: FilterPreset[]) => {
      setPresets(next);
      localStorage.setItem(storageKey, JSON.stringify(next));
    },
    [storageKey],
  );

  const save = useCallback(
    (name: string, state: Pick<AdminTableState, 'filters' | 'debouncedSearch' | 'sorting'>) => {
      const preset: FilterPreset = {
        id: crypto.randomUUID(),
        name,
        filters: state.filters,
        search: state.debouncedSearch,
        sorting: state.sorting,
      };
      const next = [preset, ...presets].slice(0, MAX_PRESETS);
      persist(next);
      return preset;
    },
    [presets, persist],
  );

  const remove = useCallback(
    (id: string) => {
      persist(presets.filter((p) => p.id !== id));
    },
    [presets, persist],
  );

  const get = useCallback((id: string) => presets.find((p) => p.id === id) ?? null, [presets]);

  return { presets, save, remove, get };
}
