import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const HINT_KEY = 'qg_map_hint_v1';

/**
 * One-time orientation nudge shown on a visitor's first map load once results
 * are in view ("142 queer spots in view"). Self-dismisses after a few seconds
 * and never returns (localStorage flag). Auto-disabled if storage is blocked.
 */
export function MapFirstRunHint({ count, ready }: { count: number; ready: boolean }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current || !ready || count <= 0) return;
    try {
      if (localStorage.getItem(HINT_KEY)) return;
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      return; // storage blocked → don't nag every load
    }
    triggered.current = true;
    const showTimer = setTimeout(() => setShow(true), 0);
    const hideTimer = setTimeout(() => setShow(false), 7000);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [ready, count]);

  if (!show) return null;

  return (
    // top-28 clears the two-row mobile bar; md:top-16 sits under the desktop bar.
    <div className="pointer-events-none absolute left-1/2 top-28 z-30 -translate-x-1/2 px-4 md:top-16">
      <div className="pointer-events-auto flex items-center gap-2 rounded-element border border-border bg-background/95 py-1.5 pl-4 pr-1.5 backdrop-blur-md">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="text-13 text-foreground">
          {t('map.firstRun.spotsInView', {
            defaultValue: '{{count}} queer spots in view',
            count,
          })}
        </span>
        <button
          type="button"
          aria-label={t('map.firstRun.dismiss', { defaultValue: 'Dismiss' })}
          onClick={() => setShow(false)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-element text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default MapFirstRunHint;
