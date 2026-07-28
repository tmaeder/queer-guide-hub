import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * `?tab=` URL sync for admin tab bars.
 *
 * ~15 admin pages hand-rolled this exact block (read the param, validate it
 * against a tuple, fall back to the first tab, omit the param when it IS the
 * first tab so the canonical URL stays clean). Keeping the default tab out of
 * the query string matters: nav rows and deep links point at the bare route.
 *
 * Other search params are preserved — the old copies dropped them by passing a
 * fresh object to setSearchParams.
 */
export function useTabParam<const T extends readonly string[]>(
  tabs: T,
  options: { param?: string } = {},
): [T[number], (next: T[number]) => void] {
  const { param = 'tab' } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(param);
  const active: T[number] = tabs.includes(raw as T[number]) ? (raw as T[number]) : tabs[0];

  const setTab = useCallback(
    (next: T[number]) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === tabs[0]) params.delete(param);
          else params.set(param, next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams, param, tabs],
  );

  return [active, setTab];
}
