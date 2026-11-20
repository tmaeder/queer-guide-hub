import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdultContentToggle } from '@/components/age-gate/AdultContentToggle';
import { OPEN_COOKIE_PREFERENCES_EVENT } from '@/lib/analyticsConsent';

/** Adult-content opt-in and cookie consent: until now only reachable from the footer. */
export function ContentConsentSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Content & cookies</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-border py-2">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Adult content</span>
            <span className="text-xs text-muted-foreground">
              Show 18+ venues, listings and pages.
            </span>
          </div>
          <AdultContentToggle />
        </div>
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Cookies & analytics</span>
            <span className="text-xs text-muted-foreground">
              What this browser may store and measure.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT))}
          >
            Manage
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
