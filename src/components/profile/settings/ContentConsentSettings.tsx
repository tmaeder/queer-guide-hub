import { Button } from '@/components/ui/button';
import { Cookie } from '@/components/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OPEN_COOKIE_PREFERENCES_EVENT } from '@/lib/analyticsConsent';

/** Cookie consent, otherwise only reachable from the footer. Adult content lives in Moderation. */
export function ContentConsentSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle icon={Cookie}>Cookies</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
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
