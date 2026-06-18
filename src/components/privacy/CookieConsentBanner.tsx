import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Cookie, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { easing } from '@/lib/motion';
import { duration, distance } from '@/lib/animation';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { CookiePreferencesDialog } from './CookiePreferencesDialog';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

export function CookieConsentBanner() {
  const { showBanner, acceptAll, acceptNecessary } = useCookieConsent();
  const [showPreferences, setShowPreferences] = useState(false);
  const reduced = useReducedMotion() ?? false;

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
        transition={reduced ? { duration: 0 } : { duration: duration.normal, ease: easing.decel }}
        className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-border/60 bg-background/95 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:flex-row md:items-center md:gap-6">
          <div className="flex items-start gap-2 md:items-center">
            <Cookie size={18} className="mt-0.5 shrink-0 text-muted-foreground md:mt-0" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              We use cookies to keep you signed in and remember your preferences — and, only with
              your consent, to measure anonymous usage. No ad trackers, no data selling. See our{' '}
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
            <Button onClick={() => setShowPreferences(true)} variant="ghost" size="sm" className="gap-2">
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
