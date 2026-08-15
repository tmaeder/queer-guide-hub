import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUp } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const SHOW_AFTER_PX = 600;

/**
 * Where the feedback FAB sits, so this button can stack ON TOP of it instead
 * of underneath it. Kept as one expression per breakpoint, mirroring
 * `FeedbackButton`: desktop `bottom: 1.5rem`, mobile the bottom-nav clearance
 * `calc(max(6rem, --map-rail-clearance + 1rem) + safe-area)`.
 *
 * This is not cosmetic. Both buttons are `position: fixed` in the
 * bottom-right; the FAB is 48px at `right-6`/`bottom:1.5rem` with `z-1200`,
 * this one is 40px at right/bottom 16 with `z-40`. Their boxes overlap and the
 * FAB wins, so this button's CENTRE was covered — a click on "Back to top"
 * opened the feedback dialog instead. e2e caught it only intermittently
 * because the FAB is lazy-mounted: the test passed whenever it clicked first.
 */
const FAB_BOTTOM_DESKTOP = '1.5rem';
const FAB_BOTTOM_MOBILE =
  'calc(max(6rem, var(--map-rail-clearance, 0rem) + 1rem) + env(safe-area-inset-bottom, 0px))';
/** FAB height (48) + a 12px gap. */
const FAB_CLEARANCE = '60px';

export function BackToTopButton() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    handler();
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  if (!visible) return null;

  // PORTALED TO <body>, and that is the whole fix.
  //
  // Rendered in place it sits inside SearchResults → RouteFade's
  // `.station-arrive` (which carries a transform during the arrival animation,
  // making it the containing block for `position: fixed`) → LayoutShell's
  // `<div className="relative z-10">` content wrapper. That wrapper opens a
  // stacking context, so this button's `z-index: 40` is scoped INSIDE it and
  // is not comparable with the footer's. The footer is the wrapper's later
  // SIBLING at the same z-10, so it paints on top no matter how high this
  // z-index goes — measured: Playwright reported the footer's legal row
  // "intercepts pointer events" and the click never reached the button.
  //
  // The feedback FAB has never had this problem for exactly one reason: it is
  // mounted in LayoutShell's peripheral chrome, outside that subtree.
  return createPortal(
    <button
      type="button"
      aria-label={t('search.backToTop', 'Back to top')}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed',
        // right 28 (not 16) centres this 40px button on the 48px FAB below it,
        // which sits at right-6 — so the two read as one stack rather than two
        // buttons that nearly line up.
        right: 28,
        bottom: `calc(${isMobile ? FAB_BOTTOM_MOBILE : FAB_BOTTOM_DESKTOP} + ${FAB_CLEARANCE})`,
        zIndex: 40,
        width: 40,
        height: 40,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'hsl(var(--foreground))',
        color: 'hsl(var(--background))',
        border: 0,
        cursor: 'pointer',
      }}
    >
      <ArrowUp size={18} />
    </button>,
    document.body,
  );
}
