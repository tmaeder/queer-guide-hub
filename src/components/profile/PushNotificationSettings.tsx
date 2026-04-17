import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
    <Card sx={{ mt: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {subscribed ? <Bell size={18} /> : <BellOff size={18} />}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }}>
              {t('settings.push.title', 'Travel reminders')}
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 1 }}>
              {t(
                'settings.push.body',
                'Get a browser notification 30 minutes before each reservation, and again when passport or visa dates get close.',
              )}
            </Typography>
            {error && (
              <Typography sx={{ color: 'error.main', fontSize: '0.8125rem', mb: 1 }}>
                {error}
              </Typography>
            )}
          </Box>
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
        </Box>
      </CardContent>
    </Card>
  );
}
