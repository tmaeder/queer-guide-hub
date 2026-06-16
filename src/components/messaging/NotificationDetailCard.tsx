import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { InboxItem } from '@/hooks/useInboxFeed';

export function NotificationDetailCard({ item }: { item: InboxItem }) {
  const { t } = useTranslation();
  const hasAction = item.open_target && item.open_target !== '#';
  return (
    <div className="flex h-full flex-col items-start gap-4 p-6">
      <h2 className="text-title">{item.title}</h2>
      <p className="text-body-lg text-muted-foreground">{item.preview}</p>
      {hasAction && (
        <Button asChild>
          <a href={item.open_target}>{t('inbox.notification.open', { defaultValue: 'Open' })}</a>
        </Button>
      )}
    </div>
  );
}
