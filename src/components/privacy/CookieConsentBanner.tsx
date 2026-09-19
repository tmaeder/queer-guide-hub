import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Cookie, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { easing } from '@/lib/motion';
import { duration, distance } from '@/lib/animation';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { OPEN_COOKIE_PREFERENCES_EVENT } from '@/lib/analyticsConsent';
import { CookiePreferencesDialog } from './CookiePreferencesDialog';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

/**
 * Window event any surface can dispatch to reopen the preferences dialog.
 *
 * The dialog is rendered here, outside the banner's own AnimatePresence, so it
 * survives the banner being dismissed — but until 2026-09-12 the ONLY thing
 * that could open it was the banner's "Customize" button, and the banner never
 * renders again after a first choice is stored. So a visitor who pressed
 * "Accept All" had no way to withdraw consent from anywhere in the UI, while
 * the dialog's own footnote told them they could change it at any time.
 * `resetConsent` had zero call sites for the same reason.
 *
 * A window event rather than context: the footer, the settings page and any
 * future policy-page link need to reach this without the consent provider
 * having to expose UI state, and a CustomEvent is what the consent layer
 * already uses to talk to the non-React loaders. The event name is defined in
 * `@/lib/analyticsConsent` so that dispatching it costs no import of this
 * lazily-loaded chunk.
 */
export function CookieConsentBanner() {
  const { showBanner, acceptAll, acceptNecessary } = useCookieConsent();
  const [showPreferences, setShowPreferences] = useState(false);
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    const open = () => setShowPreferences(true);
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, open);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, open);
  }, []);

  /**
   * Publish the bar's own height so the other bottom-fixed chrome can clear it.
   *
   * THE BANNER IS THE TOPMOST BOTTOM-FIXED LAYER: z-[var(--z-sticky)] is 100,
   * against the audio player's 30 and the FABs' 45, and it is anchored at
   * bottom-0. So it does not merely sit beside them — it PAINTS OVER them.
   * Measured on prod at 390x844 with an episode playing: the bar occupied
   * 638-844 (206px tall) and the player 674-758, i.e. the player was entirely
   * inside the bar's box and completely invisible until consent was given.
   *
   * MEASURED, NEVER A CONSTANT. The height is 206px on a 390px viewport, one
   * row on desktop, and changes again with translated copy — this text names
   * three legal links and wraps differently in every locale. A hardcoded value
   * is correct for exactly one language at one width.
   *
   * Cleared as soon as `showBanner` flips rather than on unmount: the exit
   * animation keeps the node mounted for another ~200ms, and releasing the
   * offset at the same moment lets the player settle down as the bar slides
   * out instead of jumping afterwards.
   */
  const [barEl, setBarEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty('--consent-bar-clearance');
    if (!showBanner || !barEl) {
      clear();
      return;
    }
    // Height is unaffected by the enter/exit transform — motion animates `y`,
    // not the box — so this measures the settled height from the first frame.
    const publish = () =>
      root.style.setProperty(
        '--consent-bar-clearance',
        `${Math.round(barEl.getBoundingClientRect().height)}px`,
      );
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(barEl);
    // Braces are load-bearing: removeProperty() RETURNS a string, so a concise
    // arrow makes the cleanup `() => string` and the effect's type collapses.
    return () => {
      ro.disconnect();
      clear();
    };
  }, [showBanner, barEl]);

  return (
    <>
      {/* Slim, monochrome bottom bar — flush to the viewport edge, sits at the
          sticky layer (below toasts/modals), aligned to the overlay surface
          tokens (hairline border + translucent bg + blur). */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            role="region"
            aria-label="Cookie settings"
            initial={reduced ? false : { opacity: 0, y: distance.lg }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: distance.lg }}
            transition={
              reduced ? { duration: 0 } : { duration: duration.normal, ease: easing.decel }
            }
            ref={setBarEl}
            className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] bg-surface-container-highest/95 backdrop-blur-md"
          >
            <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:flex-row md:items-center md:gap-6">
              <div className="flex items-start gap-2 md:items-center">
                <Cookie size={18} className="mt-0.5 shrink-0 text-muted-foreground md:mt-0" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We use cookies to keep you signed in and remember your preferences — and, only
                  with your consent, to measure anonymous usage. No ad trackers, no data selling.
                  See our{' '}
                  <LocalizedLink to="/legal" className="underline hover:text-foreground">
                    Legal Hub
                  </LocalizedLink>
                  ,{' '}
                  <LocalizedLink to="/privacy" className="underline hover:text-foreground">
                    Privacy
                  </LocalizedLink>{' '}
                  and{' '}
                  <LocalizedLink to="/cookies" className="underline hover:text-foreground">
                    Cookie Policy
                  </LocalizedLink>
                  .
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 md:ml-auto">
                <Button
                  onClick={() => setShowPreferences(true)}
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                >
                  <Settings size={16} />
                  Customize
                </Button>
                <Button onClick={acceptNecessary} variant="outline" size="sm">
                  Necessary Only
                </Button>
                <Button onClick={acceptAll} size="sm">
                  Accept All
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CookiePreferencesDialog open={showPreferences} onOpenChange={setShowPreferences} />
    </>
  );
}
