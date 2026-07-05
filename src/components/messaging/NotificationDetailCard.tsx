import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Map, CalendarClock, FileCheck, FileX, FileQuestion, Share2 } from 'lucide-react';
import { ShareEntityDialog } from '@/components/messaging/ShareEntityDialog';
import { useSubmissionNotifMeta, type SubmissionNotifMeta } from '@/hooks/useSubmissionNotifMeta';
import type { InboxItem } from '@/hooks/useInboxFeed';

function notifIcon(subtype: string, meta?: SubmissionNotifMeta | null) {
  if (subtype === 'trip_nudge') return <Map size={32} className="text-muted-foreground" />;
  if (subtype === 'event_reminder') return <CalendarClock size={32} className="text-muted-foreground" />;
  if (subtype === 'submission_update') {
    if (meta?.outcome === 'rejected') return <FileX size={32} className="text-muted-foreground" />;
    if (meta?.outcome === 'needs_info') return <FileQuestion size={32} className="text-muted-foreground" />;
    return <FileCheck size={32} className="text-muted-foreground" />;
  }
  return null;
}

function actionLabel(subtype: string, t: (k: string, o: object) => string) {
  if (subtype === 'trip_nudge') return t('inbox.notification.openTrip', { defaultValue: 'Open trip' });
  if (subtype === 'event_reminder') return t('inbox.notification.viewEvent', { defaultValue: 'View event' });
  if (subtype === 'submission_update') return t('inbox.notification.view', { defaultValue: 'View' });
  return t('inbox.notification.open', { defaultValue: 'Open' });
}

export function NotificationDetailCard({ item }: { item: InboxItem }) {
  const { t } = useTranslation();
  const [shareOpen, setShareOpen] = useState(false);
  const { data: meta } = useSubmissionNotifMeta(item);
  const hasAction = item.open_target && item.open_target !== '#';
  const icon = notifIcon(item.subtype, meta);
  const notes = item.subtype === 'submission_update' ? meta?.reviewer_notes : null;
  const shareable =
    item.subtype === 'submission_update' &&
    meta?.outcome === 'published' &&
    hasAction &&
    item.open_target !== '/me/contributions';
  return (
    <div className="flex h-full flex-col items-start gap-4 p-6">
      {icon && <div className="mb-2">{icon}</div>}
      <h2 className="text-title">{item.title}</h2>
      <p className="text-body-lg text-muted-foreground">{item.preview}</p>
      {notes && (
        <div className="rounded-element border border-border bg-muted/50 px-4 py-2">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground">
            {t('inbox.notification.reviewerNotes', { defaultValue: 'Reviewer notes' })}
          </p>
          <p className="text-sm">{notes}</p>
        </div>
      )}
      {hasAction && (
        <Button asChild>
          <a href={item.open_target}>{actionLabel(item.subtype, t)}</a>
        </Button>
      )}
      {shareable && (
        <>
          <Button variant="outline" onClick={() => setShareOpen(true)}>
            <Share2 size={14} className="mr-1.5" />
            {t('inbox.notification.shareToChat', { defaultValue: 'Share to chat' })}
          </Button>
          <ShareEntityDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            entity={{
              entity_table: meta?.promoted_to_table ?? null,
              entity_id: meta?.promoted_to_id ?? null,
              title: meta?.item_title ?? item.title,
              path: item.open_target,
            }}
          />
        </>
      )}
      {item.subtype === 'submission_update' && (
        <Button variant="outline" asChild>
          <a href="/me/contributions">
            {t('inbox.notification.allSubmissions', { defaultValue: 'All my submissions' })}
          </a>
        </Button>
      )}
    </div>
  );
}
