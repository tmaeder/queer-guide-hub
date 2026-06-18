import { useState } from 'react';
import { Cookie, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { CookiePreferencesDialog } from './CookiePreferencesDialog';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

export function CookieConsentBanner() {
  const { showBanner, acceptAll, acceptNecessary } = useCookieConsent();
  const [showPreferences, setShowPreferences] = useState(false);

  if (!showBanner) return null;

  return (
    <>
      {/* Slim, monochrome bottom bar — flush to the viewport edge, sits at the
          sticky layer (below toasts/modals), aligned to the overlay surface
          tokens (hairline border + translucent bg + blur). */}
      <div
        role="region"
        aria-label="Cookie settings"
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
      </div>

      <CookiePreferencesDialog open={showPreferences} onOpenChange={setShowPreferences} />
    </>
  );
}
