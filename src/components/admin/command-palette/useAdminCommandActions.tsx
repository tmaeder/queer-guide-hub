import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

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

export function useAdminCommandActions(): Ctx {
  return useContext(AdminCommandActionsContext);
}

/** Register a page-local action while the component is mounted. */
export function useRegisterAdminCommandAction(action: AdminCommandAction | null | undefined) {
  const { register } = useAdminCommandActions();
  useEffect(() => {
    if (!action) return;
    return register(action);
  }, [action, register]);
}
