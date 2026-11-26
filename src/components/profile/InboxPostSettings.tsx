import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useInboxPreferences, type InboxPreferences } from '@/hooks/useInboxPreferences';
import { Heart, MessageCircle, Reply, type LucideIcon } from '@/components/icons';

/** In-app switches for post notifications. Email has its own settings below. */
export function InboxPostSettings() {
  const { t } = useTranslation();
  const { preferences, isLoading, error, setPreference } = useInboxPreferences();

  const rows: Array<{
    field: keyof InboxPreferences;
    icon: LucideIcon;
    title: string;
    body: string;
  }> = [
    {
      field: 'post_likes',
      icon: Heart,
      title: t('settings.inbox.likes.title', 'Likes on my posts'),
      body: t('settings.inbox.likes.body', 'Show in my inbox when someone likes a post of mine.'),
    },
    {
      field: 'post_comments',
      icon: MessageCircle,
      title: t('settings.inbox.comments.title', 'Comments on my posts'),
      body: t(
        'settings.inbox.comments.body',
        'Show in my inbox when someone comments on a post of mine.',
      ),
    },
    {
      field: 'post_mentions',
      icon: Reply,
      title: t('settings.inbox.mentions.title', 'Mentions and replies'),
      body: t(
        'settings.inbox.mentions.body',
        'Show in my inbox when someone mentions me in a post or comment, or replies to my comment.',
      ),
    },
  ];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <div>
          <p className="font-bold">{t('settings.inbox.title', 'Post notifications')}</p>
          <p className="text-sm text-muted-foreground">
            {t('settings.inbox.description', 'What shows up in your inbox. Email is set below.')}
          </p>
          {error && (
            <p className="mt-2 text-13 text-destructive" role="alert">
              {t('settings.inbox.error', 'That change did not save. Try again.')}
            </p>
          )}
        </div>
        {rows.map(({ field, icon: Icon, title, body }) => (
          <div key={field} className="flex items-center gap-4">
            <Icon size={18} aria-hidden className="shrink-0 self-start text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{title}</p>
              <p className="text-13 text-muted-foreground">{body}</p>
            </div>
            <Switch
              checked={preferences[field]}
              disabled={isLoading}
              onCheckedChange={(next) => setPreference({ [field]: next })}
              aria-label={title}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
