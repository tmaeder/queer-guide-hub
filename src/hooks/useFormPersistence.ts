import { useEffect, useState, useCallback, useRef } from 'react';

/**
 * Persist form state to localStorage. Skips password fields.
 * Call clear() on successful submit to wipe stored data.
 */
export function useFormPersistence<T extends Record<string, unknown>>(
  key: string,
  initial: T,
  excludeKeys: (keyof T)[] = []
) {
  const storageKey = `qg:signup:${key}`;

  const load = (): T => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return initial;
      const parsed = JSON.parse(raw);
      return { ...initial, ...parsed };
    } catch {
      return initial;
    }
  };

  const [data, setData] = useState<T>(load);
  const skipNextWriteRef = useRef(false);

  useEffect(() => {
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    try {
      const toStore: Record<string, unknown> = {};
      for (const k of Object.keys(data)) {
        if (!excludeKeys.includes(k as keyof T)) toStore[k] = data[k as keyof T];
      }
      window.localStorage.setItem(storageKey, JSON.stringify(toStore));
    } catch {
      /* quota or private mode — ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const update = useCallback((updates: Partial<T>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  const clear = useCallback(() => {
    skipNextWriteRef.current = true;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setData(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, update, clear } as const;
}
