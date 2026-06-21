import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Map, CalendarClock } from 'lucide-react';
import type { InboxItem } from '@/hooks/useInboxFeed';

function notifIcon(subtype: string) {
  if (subtype === 'trip_nudge') return <Map size={32} className="text-muted-foreground" />;
  if (subtype === 'event_reminder') return <CalendarClock size={32} className="text-muted-foreground" />;
  return null;
}

function actionLabel(subtype: string, t: (k: string, o: object) => string) {
  if (subtype === 'trip_nudge') return t('inbox.notification.openTrip', { defaultValue: 'Open trip' });
  if (subtype === 'event_reminder') return t('inbox.notification.viewEvent', { defaultValue: 'View event' });
  return t('inbox.notification.open', { defaultValue: 'Open' });
}

export function NotificationDetailCard({ item }: { item: InboxItem }) {
  const { t } = useTranslation();
  const hasAction = item.open_target && item.open_target !== '#';
  const icon = notifIcon(item.subtype);
  return (
    <div className="flex h-full flex-col items-start gap-4 p-6">
      {icon && <div className="mb-2">{icon}</div>}
      <h2 className="text-title">{item.title}</h2>
      <p className="text-body-lg text-muted-foreground">{item.preview}</p>
      {hasAction && (
        <Button asChild>
          <a href={item.open_target}>{actionLabel(item.subtype, t)}</a>
        </Button>
      )}
    </div>
  );
}
