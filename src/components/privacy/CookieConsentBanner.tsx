import { useState } from 'react';
import { X, Cookie, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCookieConsent } from '@/hooks/useCookieConsent';
import { CookiePreferencesDialog } from './CookiePreferencesDialog';
import { Link } from 'react-router-dom';

export function CookieConsentBanner() {
  const { showBanner, acceptAll, acceptNecessary } = useCookieConsent();
  const [showPreferences, setShowPreferences] = useState(false);

  if (!showBanner) return null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-[60] p-4 bg-background/95 backdrop-blur border-t border-border">
        <Card className="p-6 max-w-4xl mx-auto">
          <div className="flex items-start gap-4">
            <Cookie className="h-6 w-6 text-muted-foreground mt-1 flex-shrink-0" />
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">Cookie Settings</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We use cookies to enhance your experience, analyze site traffic, and personalize content. 
                  You can manage your preferences or learn more in our{' '}
                  <Link to="/legal" className="underline hover:text-foreground">
                    Legal Hub
                  </Link>
                  , including our{' '}
                  <Link to="/privacy" className="underline hover:text-foreground">
                    Privacy Policy
                  </Link>
                  {' '}and{' '}
                  <Link to="/cookies" className="underline hover:text-foreground">
                    Cookie Policy
                  </Link>
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
                  className="gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Customize
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <CookiePreferencesDialog 
        open={showPreferences} 
        onOpenChange={setShowPreferences} 
      />
    </>
  );
}