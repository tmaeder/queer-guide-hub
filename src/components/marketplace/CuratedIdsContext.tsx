import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface CuratedIdsApi {
  ids: Set<string>;
  register: (key: string, ids: string[]) => void;
}

const CuratedIdsContext = createContext<CuratedIdsApi | null>(null);

export function CuratedIdsProvider({ children }: { children: ReactNode }) {
  const byKey = useRef<Map<string, string[]>>(new Map());
  const [version, setVersion] = useState(0);

  const register = useCallback((key: string, ids: string[]) => {
    const prev = byKey.current.get(key);
    if (prev && prev.length === ids.length && prev.every((id, i) => id === ids[i])) return;
    byKey.current.set(key, ids);
    setVersion((v) => v + 1);
  }, []);

  const value = useMemo<CuratedIdsApi>(() => {
    const all = new Set<string>();
    for (const ids of byKey.current.values()) for (const id of ids) all.add(id);
    return { ids: all, register };
  }, [register, version]);

  return <CuratedIdsContext.Provider value={value}>{children}</CuratedIdsContext.Provider>;
}

export function useCuratedIds(): CuratedIdsApi {
  return useContext(CuratedIdsContext) ?? { ids: new Set(), register: () => {} };
}
