import { useState } from 'react';
import { Mail, Copy, Check, Inbox as InboxIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LocalizedLink } from '@/components/routing/LocalizedLink';

/**
 * Settings card for the user's own queer.guide email address —
 * `{username}@queer.guide`. Forwarded booking confirmations land in the mail
 * inbox AND as approval-gated itinerary cards in the Travel Inbox thread.
 * Replaces the retired trips+TOKEN forwarding scheme.
 */
export function TravelForwardingSettings({ username }: { username: string | null }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const address = username ? `${username}@queer.guide` : null;

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 flex flex-col gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Mail size={16} aria-hidden="true" />
            <p className="font-semibold">
              {t('settings.forwarding.title', 'Your queer.guide email')}
            </p>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              'settings.forwarding.description',
              'Mail sent to your address appears in your inbox. Forward booking confirmations (Booking.com, Airbnb, Lufthansa and more) and they also show up as trip cards awaiting your approval.',
            )}
          </p>
        </div>

        {address ? (
          <>
            <div className="flex items-center gap-2 p-4 bg-muted font-mono text-sm" style={{ wordBreak: 'break-all' }}>
              <div className="flex-1 min-w-0">{address}</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void copy()}
                aria-label={t('settings.forwarding.copy', 'Copy address')}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </Button>
            </div>
            <div>
              <LocalizedLink to="/hub/messages">
                <Button variant="outline" size="sm">
                  <InboxIcon size={14} className="mr-1.5" />
                  {t('settings.forwarding.openInbox', 'Open inbox')}
                </Button>
              </LocalizedLink>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t(
              'settings.forwarding.claimFirst',
              'Choose a username above to activate your address.',
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
