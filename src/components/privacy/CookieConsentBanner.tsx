import { useState } from 'react';
import { Cookie, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { CookiePreferencesDialog } from './CookiePreferencesDialog';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

export function CookieConsentBanner() {
  const { showBanner, acceptAll, acceptNecessary } = useCookieConsent();
  const [showPreferences, setShowPreferences] = useState(false);

  if (!showBanner) return null;

  return (
    <>
      <div
        className="fixed z-[60] bg-background p-4 bottom-0 right-0 left-0 md:bottom-4 md:right-4 md:left-auto md:max-w-[480px]"
        style={{
          boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
        }}
      >
        <Card style={{ padding: 24, maxWidth: 896, margin: '0 auto' }}>
          <div className="flex items-start gap-4">
            <Cookie
              style={{
                height: 24,
                width: 24,
                color: 'var(--muted-foreground)',
                marginTop: 4,
                flexShrink: 0,
              }}
            />
            <div className="flex-1 flex flex-col gap-4">
              <div>
                <p className="text-base font-semibold mb-2">Cookie Settings</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We use cookies to enhance your experience, analyze site traffic, and personalize
                  content. You can manage your preferences or learn more in our{' '}
                  <LocalizedLink to="/legal" className="underline hover:text-foreground">
                    Legal Hub
                  </LocalizedLink>
                  , including our{' '}
                  <LocalizedLink to="/privacy" className="underline hover:text-foreground">
                    Privacy Policy
                  </LocalizedLink>{' '}
                  and{' '}
                  <LocalizedLink to="/cookies" className="underline hover:text-foreground">
                    Cookie Policy
                  </LocalizedLink>
                  .
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button onClick={acceptAll} size="sm">
                  Accept All
                </Button>
                <Button onClick={acceptNecessary} variant="outline" size="sm">
                  Necessary Only
                </Button>
                <Button
                  onClick={() => setShowPreferences(true)}
                  variant="ghost"
                  size="sm"
                  style={{ display: 'inline-flex', gap: 8 }}
                >
                  <Settings style={{ height: 16, width: 16 }} />
                  Customize
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <CookiePreferencesDialog open={showPreferences} onOpenChange={setShowPreferences} />
    </>
  );
}
