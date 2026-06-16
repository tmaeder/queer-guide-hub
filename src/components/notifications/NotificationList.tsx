import { CheckCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useInboxFeed } from '@/hooks/useInboxFeed';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { InboxRailItem } from '@/components/messaging/InboxRailItem';
import { useTranslation } from 'react-i18next';

const Empty = ({ label }: { label: string }) => (
  <div className="p-4 text-center text-muted-foreground">{label}</div>
);

export const NotificationList = () => {
  const { t } = useTranslation();
  const { items, loading } = useInboxFeed('all');
  const navigate = useLocalizedNavigate();
  const queryClient = useQueryClient();

  const peek = items.slice(0, 8);

  const markAlertsRead = async () => {
    await supabase.rpc('mark_all_alerts_read' as never);
    void queryClient.invalidateQueries({ queryKey: ['inbox-feed'] });
    void queryClient.invalidateQueries({ queryKey: ['inbox-unread'] });
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between p-2">
        <span className="text-sm font-medium">{t('inbox.recent', { defaultValue: 'Recent' })}</span>
        <Button variant="ghost" size="sm" onClick={markAlertsRead}>
          <CheckCheck size={12} className="mr-1" />
          {t('inbox.markAlertsRead', { defaultValue: 'Mark alerts read' })}
        </Button>
      </div>
      {loading ? (
        <Empty label={t('inbox.loading', { defaultValue: 'Loading…' })} />
      ) : peek.length === 0 ? (
        <Empty label={t('inbox.empty', { defaultValue: 'Nothing new yet' })} />
      ) : (
        <ScrollArea style={{ height: 384 }}>
          {peek.map((item) => (
            <InboxRailItem
              key={item.id}
              item={item}
              active={false}
              onSelect={(i) => navigate(i.open_target)}
            />
          ))}
        </ScrollArea>
      )}
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-13"
          onClick={() => navigate('/messages')}
        >
          {t('inbox.openInbox', { defaultValue: 'Open inbox' })}
        </Button>
      </div>
    </div>
  );
};
