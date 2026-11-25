import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

type WriteOpts = { push?: boolean };

/**
 * URL search params as typed state. Defaults are never written, so an untouched
 * page keeps a clean URL. Writes replace history unless `push` is set.
 *
 * react-router's `setSearchParams(prev => …)` passes `prev` from the render
 * closure, so a second write in the same click would erase the first. The
 * pending ref carries the merged params until the next render.
 */
export function useUrlState() {
  const [params, setParams] = useSearchParams();
  const pending = useRef<URLSearchParams | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [params]);

  const write = (key: string, value: string | null, { push = false }: WriteOpts = {}) => {
    const base = pending.current ?? params;
    const next = new URLSearchParams(base);
    if (value === null) next.delete(key);
    else next.set(key, value);
    if (next.toString() === base.toString()) return;
    pending.current = next;
    setParams(next, { replace: !push });
  };

  return {
    choice<T extends string>(key: string, allowed: readonly T[], fallback: T) {
      const raw = params.get(key);
      const value =
        raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
      const set = (v: T, opts?: WriteOpts) => write(key, v === fallback ? null : v, opts);
      return [value, set] as const;
    },
    text(key: string) {
      const set = (v: string | null, opts?: WriteOpts) => write(key, v, opts);
      return [params.get(key), set] as const;
    },
    int(key: string, fallback: number, min: number, max: number) {
      const n = Number(params.get(key));
      const value =
        params.has(key) && Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
      const set = (v: number, opts?: WriteOpts) =>
        write(key, v === fallback ? null : String(v), opts);
      return [value, set] as const;
    },
  };
}
