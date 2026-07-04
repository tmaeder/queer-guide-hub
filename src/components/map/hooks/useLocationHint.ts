import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ambient "where am I" hint shown as a subtle inline map chip rather than a
 * global toast — auto-fades after 4s, never stacks with action/error toasts.
 * Extracted verbatim from ExploreMap — behavior-preserving.
 */
export function useLocationHint() {
  const [locationHint, setLocationHint] = useState<string | null>(null);
  const locationHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showLocationHint = useCallback((label: string) => {
    setLocationHint(label);
    if (locationHintTimer.current) clearTimeout(locationHintTimer.current);
    locationHintTimer.current = setTimeout(() => setLocationHint(null), 4000);
  }, []);
  useEffect(
    () => () => {
      if (locationHintTimer.current) clearTimeout(locationHintTimer.current);
    },
    [],
  );

  return { locationHint, showLocationHint };
}
