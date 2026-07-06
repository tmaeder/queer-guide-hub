import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Smile,
  Check,
  CheckCheck,
  Clock,
  Eye,
  Reply,
  Pencil,
  Trash2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { Message } from '@/hooks/useMessaging';
import { EmojiPicker } from '@/components/messaging/EmojiPicker';
import { ReactionBurst } from '@/components/messaging/ReactionBurst';
import { QUICK_REACTIONS } from '@/lib/emojiData';
import { jumboTier } from '@/lib/messageRender';
import { EntityShareCard } from '@/components/messaging/chat/EntityShareCard';
import { isEntityShareMeta } from '@/components/messaging/chat/entityShare';
import { SubmissionChatCard } from '@/components/messaging/chat/SubmissionChatCard';
import { isSubmissionMeta } from '@/components/messaging/chat/submissionShare';
import { ItineraryChatCard } from '@/components/messaging/chat/ItineraryChatCard';
import { isItineraryMeta } from '@/components/messaging/chat/itineraryShare';

interface MessageItemProps {
  message: Message;
  isOwn: boolean;
  currentUserId?: string;
  replyingTo?: Message | null;
  highlighted?: boolean;
  onReaction: (messageId: string, emoji: string) => void;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onScrollToMessage: (messageId: string) => void;
}

interface GroupedReaction {
  emoji: string;
  count: number;
  mine: boolean;
  names: string[];
}

function groupReactions(message: Message, currentUserId?: string): GroupedReaction[] {
  const map = new Map<string, GroupedReaction>();
  for (const r of message.reactions ?? []) {
    const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, names: [] };
    g.count += 1;
    if (r.user_id === currentUserId) g.mine = true;
    if (r.user?.display_name) g.names.push(r.user.display_name);
    map.set(r.emoji, g);
  }
  return [...map.values()];
}

const MessageStatusIcon = ({ status }: { status?: Message['status'] }) => {
  switch (status) {
    case 'sending':
      return <Clock size={12} className="text-muted-foreground" />;
    case 'sent':
      return <Check size={12} className="text-muted-foreground" />;
    case 'delivered':
      return <CheckCheck size={12} className="text-muted-foreground" />;
    case 'read':
      return <Eye size={12} />;
    default:
      return null;
  }
};

export const MessageItem = ({
  message,
  isOwn,
  currentUserId,
  replyingTo,
  highlighted,
  onReaction,
  onReply,
  onEdit,
  onDelete,
  onScrollToMessage,
}: MessageItemProps) => {
  const { t } = useTranslation();
  const [burst, setBurst] = useState<{ emoji: string; id: number } | null>(null);
  const isDeleted = !!message.deleted_at;
  const jumbo = isDeleted ? 0 : message.message_type === 'sticker' ? 2 : jumboTier(message.content);

  const react = (emoji: string) => {
    onReaction(message.id, emoji);
    setBurst({ emoji, id: Date.now() });
  };

  const grouped = groupReactions(message, currentUserId);

  return (
    <div
      id={`msg-${message.id}`}
      style={{ justifyContent: isOwn ? 'flex-end' : 'flex-start' }}
      className="group flex mb-4"
    >
      <div style={{ maxWidth: '70%', order: isOwn ? 2 : 1 }}>
        {!isOwn && (
          <div className="flex items-center gap-2 mb-1">
            <Avatar style={{ height: 24, width: 24 }}>
              <AvatarImage src={message.sender?.avatar_url || ''} />
              <AvatarFallback>{message.sender?.display_name?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">
              {message.sender?.display_name || 'Unknown User'}
            </span>
          </div>
        )}

        <div className="relative">
          {burst && <ReactionBurst emoji={burst.emoji} onDone={() => setBurst(null)} />}

          {/* Quoted reply stub */}
          {replyingTo && !isDeleted && (
            <button
              type="button"
              onClick={() => onScrollToMessage(replyingTo.id)}
              className="mb-1 flex w-full flex-col items-start gap-0.5 rounded-element border-l-2 border-foreground bg-muted/60 px-2 py-1 text-left"
            >
              <span className="text-2xs font-medium text-foreground">
                {replyingTo.sender?.display_name || t('chat.reply.someone', { defaultValue: 'Someone' })}
              </span>
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {replyingTo.deleted_at
                  ? t('chat.deleted', { defaultValue: 'Message deleted' })
                  : replyingTo.content}
              </span>
            </button>
          )}

          {!isDeleted && message.message_type === 'entity_share' && isEntityShareMeta(message.metadata) ? (
            <EntityShareCard meta={message.metadata} note={message.content} />
          ) : !isDeleted && message.message_type === 'itinerary' && isItineraryMeta(message.metadata) ? (
            <ItineraryChatCard meta={message.metadata} />
          ) : !isDeleted && message.message_type === 'submission' && isSubmissionMeta(message.metadata) ? (
            <SubmissionChatCard messageId={message.id} meta={message.metadata} />
          ) : jumbo > 0 && !isDeleted ? (
            <div
              className="leading-none"
              style={{
                fontSize: message.message_type === 'sticker' || jumbo === 2 ? 56 : 40,
                textAlign: isOwn ? 'right' : 'left',
                opacity: message.status === 'sending' ? 0.6 : 1,
                ...(highlighted
                  ? { outline: '2px solid hsl(var(--foreground))', borderRadius: 'var(--radius-element)' }
                  : {}),
              }}
            >
              {message.content}
            </div>
          ) : (
            <div
              className="transition-shadow"
              style={{
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 8,
                paddingBottom: 8,
                borderRadius: 'var(--radius-container)',
                ...(isOwn
                  ? {
                      backgroundColor: 'var(--primary)',
                      color: 'var(--primary-foreground)',
                      borderBottomRightRadius: 'var(--radius-element)',
                    }
                  : {
                      backgroundColor: 'var(--muted)',
                      borderBottomLeftRadius: 'var(--radius-element)',
                    }),
                ...(message.status === 'sending' ? { opacity: 0.6 } : {}),
                ...(highlighted ? { boxShadow: '0 0 0 2px hsl(var(--foreground))' } : {}),
              }}
            >
              {isDeleted ? (
                <p className="text-sm italic opacity-70">
                  {t('chat.deleted', { defaultValue: 'Message deleted' })}
                </p>
              ) : (
                <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
              )}
            </div>
          )}

          <div style={{ alignItems: 'center', justifyContent: 'space-between' }} className="flex mt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
              </span>
              {message.edited_at && !isDeleted && (
                <span className="text-2xs text-muted-foreground">
                  {t('chat.edited', { defaultValue: 'edited' })}
                </span>
              )}
              {isOwn && <MessageStatusIcon status={message.status} />}
            </div>

            {/* Hover actions: react / reply / (own) edit-delete */}
            {!isDeleted && (
              <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <EmojiPicker
                  onSelect={react}
                  side="top"
                  align={isOwn ? 'end' : 'start'}
                  trigger={
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" aria-label={t('chat.react', { defaultValue: 'React' })}>
                      <Smile size={13} />
                    </Button>
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  aria-label={t('chat.reply.action', { defaultValue: 'Reply' })}
                  onClick={() => onReply(message)}
                >
                  <Reply size={13} />
                </Button>
                {isOwn && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" aria-label={t('common.more', { defaultValue: 'More' })}>
                        <MoreVertical size={13} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(message)}>
                        <Pencil size={14} className="mr-2" />
                        {t('common.edit', { defaultValue: 'Edit' })}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(message.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 size={14} className="mr-2" />
                        {t('common.delete', { defaultValue: 'Delete' })}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>

          {/* Quick-react bar on hover */}
          {!isDeleted && (
            <div className="mt-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => react(emoji)}
                  className="flex h-7 w-7 items-center justify-center rounded-badge text-sm transition-colors hover:bg-muted"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Grouped reaction badges with counts + who-reacted tooltip */}
          {grouped.length > 0 && (
            <TooltipProvider>
              <div style={{ flexWrap: 'wrap' }} className="flex gap-1 mt-2">
                {grouped.map((g) => (
                  <Tooltip key={g.emoji}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => react(g.emoji)}
                        className={`rounded-badge border px-1.5 py-0.5 text-xs transition-colors ${
                          g.mine
                            ? 'border-foreground bg-muted'
                            : 'border-border bg-muted hover:bg-muted/70'
                        }`}
                      >
                        {g.emoji} {g.count}
                      </button>
                    </TooltipTrigger>
                    {g.names.length > 0 && <TooltipContent>{g.names.join(', ')}</TooltipContent>}
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
};
