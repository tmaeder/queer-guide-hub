import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { CuratedIdsContext, type CuratedIdsApi } from './curatedIdsContextValue';

export function CuratedIdsProvider({ children }: { children: ReactNode }) {
  const byKey = useRef<Map<string, string[]>>(new Map());
  const [version, setVersion] = useState(0);

  const register = useCallback((key: string, ids: string[]) => {
    const prev = byKey.current.get(key);
    if (prev && prev.length === ids.length && prev.every((id, i) => id === ids[i])) return;
    byKey.current.set(key, ids);
    setVersion((v) => v + 1);
  }, []);

  // `version` is in the dep array because byKey is a mutable ref — bumping the
  // counter is how `register` triggers a recompute of the merged set.
  const value = useMemo<CuratedIdsApi>(() => {
    const all = new Set<string>();
    for (const ids of byKey.current.values()) for (const id of ids) all.add(id);
    return { ids: all, register };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, version]);

  return <CuratedIdsContext.Provider value={value}>{children}</CuratedIdsContext.Provider>;
}
