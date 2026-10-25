import { useEffect, useState } from 'react';

/**
 * True once `loading` has lasted `ms` for the same request `key`. Keyed so a
 * new request starts a fresh window instead of inheriting the old timeout.
 */
export function useLoadingTimedOut(loading: boolean, key: string, ms = 30000) {
  const [timedOutFor, setTimedOutFor] = useState<string | null>(null);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setTimedOutFor(key), ms);
    return () => clearTimeout(timer);
  }, [loading, key, ms]);
  return loading && timedOutFor === key;
}
