import {
  MessageCircle,
  Heart,
  Mail,
  Bell,
  Ticket,
  Pin,
  PinOff,
  BellOff,
  Bell as BellOn,
  Archive,
  CheckCheck,
  MoreVertical,
} from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { InboxItem } from '@/hooks/useInboxFeed';

const KIND_ICON = {
  chat: MessageCircle,
  mail: Mail,
  notification: Bell,
  trip_email: Ticket,
} as const;

export interface RailActions {
  togglePin: (conversationId: string, next: boolean) => void;
  toggleMute: (conversationId: string, next: boolean) => void;
  toggleArchive: (conversationId: string, next: boolean) => void;
  markRead: (conversationId: string) => void;
}

/** Compose the preview line: "You: " prefix + media-aware label. */
function usePreview(item: InboxItem): string {
  const { t } = useTranslation();
  if (item.kind === 'mail' && item.subtype === 'outbound')
    return `${t('inbox.mail.sent', { defaultValue: 'Sent' })}: ${item.preview}`;
  if (item.kind !== 'chat') return item.preview;
  const label = (() => {
    switch (item.last_message_subtype) {
      case 'image':
        return `📷 ${t('chat.preview.photo', { defaultValue: 'Photo' })}`;
      case 'gif':
        return 'GIF';
      case 'sticker':
        return t('chat.preview.sticker', { defaultValue: 'Sticker' });
      case 'voice':
        return `🎤 ${t('chat.preview.voice', { defaultValue: 'Voice message' })}`;
      default:
        return item.preview;
    }
  })();
  if (item.last_sender_is_me && label) {
    return `${t('chat.preview.you', { defaultValue: 'You' })}: ${label}`;
  }
  return label;
}

export function InboxRailItem({
  item,
  active,
  onSelect,
  online,
  actions,
}: {
  item: InboxItem;
  active: boolean;
  onSelect: (item: InboxItem) => void;
  online?: boolean;
  actions?: RailActions;
}) {
  const { t, i18n } = useTranslation();
  const date = new Date(item.ts);
  const validDate = !Number.isNaN(date.getTime());
  const timestamp = validDate
    ? new Intl.DateTimeFormat(i18n?.language, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
    : '';
  const isChat = item.kind === 'chat';
  const isMatch = isChat && item.subtype === 'match';
  const Icon = KIND_ICON[item.kind];
  const conversationId = isChat ? item.id.replace('conv_', '') : '';
  const preview = usePreview(item);

  return (
    <div
      className={cn(
        'group relative flex w-full items-start gap-2 border-b border-border-hairline p-4 text-left transition-colors hover:bg-muted/50 md:p-4',
        item.unread && 'bg-muted/30',
        active && 'bg-muted',
      )}
    >
      <button
        onClick={() => onSelect(item)}
        aria-current={active ? 'true' : undefined}
        className="flex min-h-11 min-w-0 flex-1 items-start gap-4 rounded-element text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isChat ? (
          <span className="relative shrink-0">
            <Avatar className="h-10 w-10">
              <AvatarImage src={item.avatar_url || ''} />
              <AvatarFallback>{item.title?.charAt(0)?.toUpperCase() || 'C'}</AvatarFallback>
            </Avatar>
            {isMatch && (
              <span
                className="border-2 absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-background bg-foreground"
                aria-hidden
              >
                <Heart className="h-2.5 w-2.5 fill-background text-background" />
              </span>
            )}
            {online && (
              <span
                className="border-2 absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-background bg-foreground"
                role="status"
                aria-label={t('chat.activeNow', { defaultValue: 'Active now' })}
              />
            )}
          </span>
        ) : (
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'flex min-w-0 items-center gap-1 truncate text-15',
                item.unread && 'font-semibold',
              )}
            >
              {item.is_pinned && (
                <Pin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              )}
              {item.is_muted && (
                <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="truncate">{item.title}</span>
              {(isMatch || item.subtype === 'group') && (
                <span className="shrink-0 rounded-badge bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                  {isMatch
                    ? t('inbox.matchTag', { defaultValue: 'Match' })
                    : t('inbox.groupTag', { defaultValue: 'Group' })}
                </span>
              )}
            </span>
            {item.unread &&
              (item.unread_count > 0 ? (
                <span
                  className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-foreground px-1 text-2xs font-semibold text-background"
                  role="status"
                  aria-label={t('inbox.unreadCount', {
                    defaultValue: '{{count}} unread',
                    count: item.unread_count,
                  })}
                >
                  {item.unread_count > 99 ? '99+' : item.unread_count}
                </span>
              ) : (
                <span
                  className="h-2 w-2 shrink-0 rounded-full bg-foreground"
                  role="status"
                  aria-label={t('inbox.unread', { defaultValue: 'Unread' })}
                />
              ))}
          </span>
          <span
            className={cn(
              'mt-1 block truncate text-13',
              item.unread ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {preview}
          </span>
          {validDate && (
            <time
              dateTime={item.ts}
              title={date.toLocaleString(i18n?.language)}
              className="mt-1 block text-2xs tabular-nums text-muted-foreground"
            >
              {timestamp}
            </time>
          )}
        </span>
      </button>

      {isChat && actions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-element text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('common.more', { defaultValue: 'More' })}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => actions.togglePin(conversationId, !item.is_pinned)}>
              {item.is_pinned ? (
                <PinOff className="mr-2 h-4 w-4" />
              ) : (
                <Pin className="mr-2 h-4 w-4" />
              )}
              {item.is_pinned
                ? t('inbox.action.unpin', { defaultValue: 'Unpin' })
                : t('inbox.action.pin', { defaultValue: 'Pin' })}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.toggleMute(conversationId, !item.is_muted)}>
              {item.is_muted ? (
                <BellOn className="mr-2 h-4 w-4" />
              ) : (
                <BellOff className="mr-2 h-4 w-4" />
              )}
              {item.is_muted
                ? t('inbox.action.unmute', { defaultValue: 'Unmute' })
                : t('inbox.action.mute', { defaultValue: 'Mute' })}
            </DropdownMenuItem>
            {item.unread && (
              <DropdownMenuItem onClick={() => actions.markRead(conversationId)}>
                <CheckCheck className="mr-2 h-4 w-4" />
                {t('inbox.action.markRead', { defaultValue: 'Mark as read' })}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => actions.toggleArchive(conversationId, true)}>
              <Archive className="mr-2 h-4 w-4" />
              {t('inbox.action.archive', { defaultValue: 'Archive' })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
