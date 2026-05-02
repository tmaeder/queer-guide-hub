import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePushSubscription } from '@/hooks/usePushSubscription';

/**
 * Push-notification toggle row in Profile Settings → Travel.
 *
 * Two reminder types today: 30 min before a trip reservation, and 30/7
 * days before a trip-document expires. Opt-in only, one click to enable
 * or disable. Hidden entirely when the browser doesn't support PushManager
 * or when VAPID isn't configured.
 */
export function PushNotificationSettings() {
  const { t } = useTranslation();
  const { supported, subscribed, pending, subscribe, unsubscribe, error } =
    usePushSubscription();

  if (!supported) return null;

  return (
    <Card className="mt-6">
      <CardContent>
        <div className="flex items-start gap-4">
          <div className="w-9 h-9 bg-muted/40 flex items-center justify-center shrink-0">
            {subscribed ? <Bell size={18} /> : <BellOff size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold">{t('settings.push.title', 'Travel reminders')}</p>
            <p className="text-muted-foreground text-sm mb-2">
              {t(
                'settings.push.body',
                'Get a browser notification 30 minutes before each reservation, and again when passport or visa dates get close.',
              )}
            </p>
            {error && (
              <p className="text-destructive text-[0.8125rem] mb-2">{error}</p>
            )}
          </div>
          <Button
            variant={subscribed ? 'outline' : 'default'}
            size="sm"
            onClick={subscribed ? unsubscribe : subscribe}
            disabled={pending}
          >
            {subscribed
              ? t('settings.push.turnOff', 'Turn off')
              : t('settings.push.turnOn', 'Turn on')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
