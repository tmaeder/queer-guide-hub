import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

const HINT_KEY = 'qg_map_hint_v1';

/**
 * One-time orientation nudge shown on a visitor's first map load once results
 * are in view ("142 queer spots in view"). Self-dismisses after a few seconds
 * and never returns (localStorage flag). Auto-disabled if storage is blocked.
 */
export function MapFirstRunHint({ count, ready }: { count: number; ready: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show || !ready || count <= 0) return;
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      return; // storage blocked → don't nag every load
    }
    setShow(true);
    const timer = setTimeout(() => setShow(false), 7000);
    return () => clearTimeout(timer);
  }, [ready, count, show]);

  if (!show) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 px-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-background/95 py-1.5 pl-3 pr-1.5 backdrop-blur">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="text-13 text-foreground">
          {count.toLocaleString()} queer spots in view
        </span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setShow(false)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default MapFirstRunHint;
