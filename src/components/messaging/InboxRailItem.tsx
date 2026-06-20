import { MessageCircle, Mail, Bell, Pin, PinOff, BellOff, Bell as BellOn, Archive, CheckCheck, MoreVertical } from 'lucide-react';
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

const KIND_ICON = { chat: MessageCircle, mail: Mail, notification: Bell } as const;

export interface RailActions {
  togglePin: (conversationId: string, next: boolean) => void;
  toggleMute: (conversationId: string, next: boolean) => void;
  toggleArchive: (conversationId: string, next: boolean) => void;
  markRead: (conversationId: string) => void;
}

/** Compose the preview line: "You: " prefix + media-aware label. */
function usePreview(item: InboxItem): string {
  const { t } = useTranslation();
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
  const { t } = useTranslation();
  const Icon = KIND_ICON[item.kind];
  const isChat = item.kind === 'chat';
  const conversationId = isChat ? item.id.replace('conv_', '') : '';
  const preview = usePreview(item);

  return (
    <div
      className={cn(
        'group relative flex w-full items-start gap-2 border-b p-4 text-left',
        active && 'bg-muted',
      )}
    >
      <button
        onClick={() => onSelect(item)}
        className="flex min-w-0 flex-1 items-start gap-2 text-left"
      >
        {isChat ? (
          <span className="relative shrink-0">
            <Avatar className="h-9 w-9">
              <AvatarImage src={item.avatar_url || ''} />
              <AvatarFallback>{item.title?.charAt(0)?.toUpperCase() || 'C'}</AvatarFallback>
            </Avatar>
            {online && (
              <span
                className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-accent-brand"
                role="status"
                aria-label={t('chat.activeNow', { defaultValue: 'Active now' })}
              />
            )}
          </span>
        ) : (
          <Icon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className={cn('flex min-w-0 items-center gap-1 truncate text-15', item.unread && 'font-semibold')}>
              {item.is_pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
              {item.is_muted && <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="truncate">{item.title}</span>
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
          <span className="block truncate text-13 text-muted-foreground">{preview}</span>
        </span>
      </button>

      {isChat && actions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="shrink-0 rounded-element p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100"
              aria-label={t('common.more', { defaultValue: 'More' })}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => actions.togglePin(conversationId, !item.is_pinned)}>
              {item.is_pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
              {item.is_pinned
                ? t('inbox.action.unpin', { defaultValue: 'Unpin' })
                : t('inbox.action.pin', { defaultValue: 'Pin' })}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.toggleMute(conversationId, !item.is_muted)}>
              {item.is_muted ? <BellOn className="mr-2 h-4 w-4" /> : <BellOff className="mr-2 h-4 w-4" />}
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
