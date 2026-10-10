/* eslint-disable react-refresh/only-export-components -- provider and hooks form one context API. */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface PageEntity {
  contentType: string;
  contentId: string;
  contentName?: string;
}

type PageEntityContextValue = {
  entity: PageEntity | null;
  setEntity: (entity: PageEntity | null) => void;
};

const PageEntityContext = createContext<PageEntityContextValue | null>(null);

export function PageEntityProvider({ children }: { children: ReactNode }) {
  const [entity, setEntity] = useState<PageEntity | null>(null);
  const value = useMemo(() => ({ entity, setEntity }), [entity]);
  return <PageEntityContext.Provider value={value}>{children}</PageEntityContext.Provider>;
}

/** Read the entity published by the current detail page. */
export function usePageEntityState(): PageEntity | null {
  return useContext(PageEntityContext)?.entity ?? null;
}

/**
 * Publish the entity represented by the current page. Clears on unmount and is
 * intentionally safe outside the provider, matching BreadcrumbContext.
 */
export function usePageEntity(entity: PageEntity | null | undefined): void {
  const setEntity = useContext(PageEntityContext)?.setEntity;
  const key = entity ? `${entity.contentType}|${entity.contentId}|${entity.contentName ?? ''}` : '';

  useEffect(() => {
    if (!setEntity) return;
    setEntity(entity ?? null);
    return () => setEntity(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setEntity]);
}
