import { Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cookie } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { OPEN_COOKIE_PREFERENCES_EVENT } from '@/lib/analyticsConsent';
import { lazyRetry } from '@/utils/lazyRetry';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
const CookiePreferencesDialog = lazyRetry(() =>
  import('./CookiePreferencesDialog').then((m) => ({ default: m.CookiePreferencesDialog })),
);

/**
 * Window event any surface can dispatch to reopen the preferences dialog.
 *
 * The dialog is rendered here, outside the banner's conditional rendering, so it
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
  const { t } = useTranslation();
  const { showBanner, acceptAll, acceptNecessary } = useCookieConsent();
  const [showPreferences, setShowPreferences] = useState(false);

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
   * above the viewport edge. So it does not merely sit beside them — without
   * the published clearance it can still paint over lower floating controls.
   * Measured on prod at 390x844 with an episode playing: the bar occupied
   * 638-844 (206px tall) and the player 674-758, i.e. the player was entirely
   * inside the bar's box and completely invisible until consent was given.
   *
   * MEASURED, NEVER A CONSTANT. The height is 206px on a 390px viewport, one
   * row on desktop, and changes again with translated copy — this text names
   * three legal links and wraps differently in every locale. A hardcoded value
   * is correct for exactly one language at one width.
   *
   * Cleared as soon as the banner is dismissed so the other controls settle
   * into their normal positions immediately.
   */
  const [barEl, setBarEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty('--consent-bar-clearance');
    if (!showBanner || !barEl) {
      clear();
      return;
    }
    // Height is unaffected by the enter/exit transform — CSS animates translate,
    // not the box — so this measures the settled height from the first frame.
    const publish = () => {
      const inset =
        Number.parseFloat(getComputedStyle(root).getPropertyValue('--island-inset')) || 14;
      root.style.setProperty(
        '--consent-bar-clearance',
        `${Math.round(barEl.getBoundingClientRect().height + inset)}px`,
      );
    };
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
      {/* A small paper card in the bottom corner (full width only on phones,
          and lifted above the dock there via the dock's --dock-clearance).
          The two consent choices carry EQUAL weight — same style, same size,
          side by side — because refusing must be as easy and as visible as
          accepting (EDPB 03/2022, CNIL). The English accessible names
          "Cookie settings", "Accept All" and "Necessary Only" are
          load-bearing: e2e specs find the banner and dismiss it by them. */}
      {showBanner && (
        <div
          role="region"
          aria-label={t('cookieBanner.ariaLabel', 'Cookie settings')}
          ref={setBarEl}
          className="animate-in fade-in-0 slide-in-from-bottom-4 duration-normal motion-reduce:animate-none fixed bottom-[calc(var(--island-inset)+var(--dock-clearance,0px))] left-[var(--island-inset)] right-[var(--island-inset)] z-[var(--z-sticky)] rounded-container bg-card p-4 shadow-soft-lg sm:right-auto sm:max-w-sm"
        >
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-full bg-muted"
            >
              <Cookie size={18} />
            </span>
            <p className="text-15 font-bold leading-tight">
              {t('cookieBanner.title', 'Your privacy, your choice')}
            </p>
          </div>
          <p className="mt-4 text-13 leading-relaxed text-muted-foreground">
            {t(
              'cookieBanner.body',
              'We use cookies to keep you signed in. Anonymous usage stats only with your consent, and no ad trackers.',
            )}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={acceptNecessary} className="font-bold">
              {t('cookieBanner.necessaryOnly', 'Necessary Only')}
            </Button>
            <Button onClick={acceptAll} className="font-bold">
              {t('cookieBanner.acceptAll', 'Accept All')}
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Button
              onClick={() => setShowPreferences(true)}
              variant="ghost"
              size="sm"
              className="-ms-2 px-2 text-13 font-normal text-muted-foreground"
            >
              {t('cookieBanner.customize', 'Customize')}
            </Button>
            <LocalizedLink
              to="/cookies"
              className="inline-flex min-h-11 items-center text-13 text-muted-foreground underline"
            >
              {t('cookieBanner.policy', 'Cookie policy')}
            </LocalizedLink>
          </div>
        </div>
      )}

      {showPreferences && (
        <Suspense fallback={null}>
          <CookiePreferencesDialog open={showPreferences} onOpenChange={setShowPreferences} />
        </Suspense>
      )}
    </>
  );
}
