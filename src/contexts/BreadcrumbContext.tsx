import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type BreadcrumbItem = { label: ReactNode; href?: string };

type BreadcrumbContextValue = {
  /** Page-published trail, or null when the page defers to the route-config fallback. */
  items: BreadcrumbItem[] | null;
  setItems: (items: BreadcrumbItem[] | null) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[] | null>(null);
  const value = useMemo(() => ({ items, setItems }), [items]);
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

/** Read the current page-published trail (the global bar uses this). */
export function useBreadcrumbState(): BreadcrumbItem[] | null {
  const ctx = useContext(BreadcrumbContext);
  return ctx?.items ?? null;
}

/**
 * Publish a breadcrumb trail for the current page. Pass `null`/`undefined`
 * to defer to the route-config fallback. Clears on unmount so the next route
 * doesn't inherit a stale trail. Safe to call outside a provider (no-op).
 */
export function useBreadcrumbs(items: BreadcrumbItem[] | null | undefined): void {
  const ctx = useContext(BreadcrumbContext);
  const setItems = ctx?.setItems;
  // Serialize the trail so the effect only re-runs when labels/hrefs change,
  // not on every render that produces a fresh array reference.
  const key = items ? items.map((c) => `${labelKey(c.label)}|${c.href ?? ''}`).join('>') : '';
  useEffect(() => {
    if (!setItems) return;
    setItems(items ?? null);
    return () => setItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setItems]);
}

function labelKey(label: ReactNode): string {
  return typeof label === 'string' || typeof label === 'number' ? String(label) : '∎';
}
