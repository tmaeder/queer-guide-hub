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
 *
 * **The setter takes `string`, not `T[number]`, and that is what makes the hook
 * usable at all.** Radix's `Tabs.onValueChange` is `(value: string) => void`, so
 * a setter narrowed to the tuple is not assignable to it — parameter types are
 * contravariant, and a handler that accepts only four strings cannot stand where
 * any string may be passed. Every call site would have needed a cast.
 *
 * That was not a hypothetical: this hook shipped with the narrow signature, had
 * ~15 hand-rolled copies to replace, and was adopted by **none** of them. Its
 * own tests passed throughout, because the harness called `setTab(t)` with `t`
 * already drawn from the tuple — the boundary the hook has to cross in
 * production was the one place the tests never went.
 *
 * Widening is strictly safer rather than looser: an unrecognised value is now
 * *ignored* instead of being written to the URL, which the narrow version would
 * happily have done for any caller that cast.
 */
export function useTabParam<const T extends readonly string[]>(
  tabs: T,
  options: { param?: string } = {},
): [T[number], (next: string) => void] {
  const { param = 'tab' } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get(param);
  const active: T[number] = tabs.includes(raw as T[number]) ? (raw as T[number]) : tabs[0];

  const setTab = useCallback(
    (next: string) => {
      if (!tabs.includes(next)) return;
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
