import { useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Copy, Check, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/hooks/useProfile';

/**
 * Shown at the top of the Travel Inbox thread: the user's personal forwarding
 * address `{username}@queer.guide`. Forward any booking confirmation here and it
 * lands in this thread as an itinerary card awaiting approval.
 */
export function TravelInboxAddressBanner() {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const [copied, setCopied] = useState(false);

  const address = profile?.username ? `${profile.username}@queer.guide` : null;

  async function copy() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-container border border-border bg-muted/40 p-4">
      <div className="flex items-center gap-2">
        <Mail size={14} className="text-muted-foreground shrink-0" />
        <span className="text-2xs uppercase tracking-wider text-muted-foreground">
          {t('chat.itinerary.forwardHere', { defaultValue: 'Forward bookings here' })}
        </span>
      </div>
      {address ? (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-element bg-background px-2 py-1 text-sm text-foreground">
            {address}
          </code>
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={copy}>
            {copied ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}
            {copied
              ? t('common.copied', { defaultValue: 'Copied' })
              : t('common.copy', { defaultValue: 'Copy' })}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('chat.itinerary.claimFirst', {
            defaultValue: 'Claim a username to get your forwarding address.',
          })}{' '}
          <Link to="/profile/settings" className="underline">
            {t('chat.itinerary.claimLink', { defaultValue: 'Choose a username' })}
          </Link>
        </p>
      )}
      <p className="text-2xs text-muted-foreground">
        {t('chat.itinerary.forwardHint', {
          defaultValue: 'Booking.com, Airbnb, Lufthansa and more. Each booking needs your approval before it is saved.',
        })}
      </p>
    </div>
  );
}
