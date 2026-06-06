import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export interface AdminCommandAction {
  id: string;
  label: string;
  shortcut?: string;
  keywords?: string;
  perform: () => void;
}

interface Ctx {
  actions: AdminCommandAction[];
  register: (action: AdminCommandAction) => () => void;
}

const AdminCommandActionsContext = createContext<Ctx>({
  actions: [],
  register: () => () => {},
});

export function AdminCommandActionsProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<Map<string, AdminCommandAction>>(new Map());

  const register = useCallback((action: AdminCommandAction) => {
    setMap((prev) => {
      const next = new Map(prev);
      next.set(action.id, action);
      return next;
    });
    return () => {
      setMap((prev) => {
        const next = new Map(prev);
        next.delete(action.id);
        return next;
      });
    };
  }, []);

  const value = useMemo<Ctx>(
    () => ({ actions: Array.from(map.values()), register }),
    [map, register],
  );

  return (
    <AdminCommandActionsContext.Provider value={value}>
      {children}
    </AdminCommandActionsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- pure helper colocated with consumer; tests import it directly.
export function useAdminCommandActions(): Ctx {
  return useContext(AdminCommandActionsContext);
}

/**
 * Register a page-local action while the component is mounted.
 *
 * Callers pass an inline object literal, so `action` has a fresh identity every
 * render. Depending on the object directly would re-run the effect each render →
 * register() → setMap → context re-render → loop ("Maximum update depth exceeded",
 * React #185). Depend on the stable primitive fields instead, and read `perform`
 * through a ref so the latest closure runs without re-registering.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper colocated with consumer; tests import it directly.
export function useRegisterAdminCommandAction(action: AdminCommandAction | null | undefined) {
  const { register } = useAdminCommandActions();

  const performRef = useRef(action?.perform);
  useEffect(() => {
    performRef.current = action?.perform;
  });

  const { id, label, shortcut, keywords } = action ?? {};

  useEffect(() => {
    if (!id || !label) return;
    return register({
      id,
      label,
      shortcut,
      keywords,
      perform: () => performRef.current?.(),
    });
  }, [id, label, shortcut, keywords, register]);
}
