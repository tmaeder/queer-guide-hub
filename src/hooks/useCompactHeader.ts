import { useEffect, useState } from 'react';

/**
 * True once the page has been scrolled past `threshold`px.
 *
 * Design contract ("Header and Footer.dc.html", panel 06, "Collapse once, not
 * repeatedly"): the bar reverses and shrinks on the first scroll past 40px and
 * STAYS that way — it does not re-expand on scroll up, because that makes the
 * bar flicker on trackpads where a single gesture crosses the threshold
 * repeatedly. So this latches: false → true, never back.
 *
 * It resets only on navigation, which happens naturally because the header
 * remounts per route… it does not. Hence the explicit reset when the document
 * is genuinely back at the top (< 4px), which a route change produces via the
 * scroll-restoration jump but a trackpad wobble does not.
 */
export function useCompactHeader(threshold = 40): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      if (y > threshold) setCompact(true);
      else if (y < 4) setCompact(false);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return compact;
}
