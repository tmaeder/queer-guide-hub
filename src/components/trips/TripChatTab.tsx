import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Send, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useTripChat, useSendTripMessage } from '@/hooks/useTripChat';
import { useTripPresence } from '@/hooks/useTripPresence';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  tripId: string;
}

/**
 * Trip chat tab — per-trip group conversation.
 *
 * Reads / writes `trip_messages` (RLS restricts to trip members). Realtime
 * INSERT subscription keeps every member's view in sync. No read receipts
 * or typing indicators yet; they land in a follow-up.
 */
export function TripChatTab({ tripId }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: messages, isLoading } = useTripChat(tripId);
  const send = useSendTripMessage(tripId);
  const presentMembers = useTripPresence(tripId);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  const onSend = () => {
    const text = draft.trim();
    if (!text || send.isPending) return;
    send.mutate(
      { content: text },
      {
        onSuccess: () => setDraft(''),
      },
    );
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {t('trips.chat.loading', 'Loading conversation…')}
      </div>
    );
  }

  const visibleMembers = presentMembers.slice(0, 4);
  const overflow = presentMembers.length - visibleMembers.length;

  return (
    <div className="flex flex-col h-[480px] md:h-[600px]">
      {presentMembers.length > 0 && (
        <div className="flex items-center gap-2 px-2 py-1.5 mb-2 border-b border-border">
          <span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"
          />
          <TooltipProvider>
            <div className="flex -space-x-2">
              {visibleMembers.map((m) => (
                <Tooltip key={m.user_id}>
                  <TooltipTrigger asChild>
                    <Avatar className="h-[22px] w-[22px] border border-background text-[11px]">
                      {m.avatar_url && <AvatarImage src={m.avatar_url} alt={m.display_name ?? ''} />}
                      <AvatarFallback className="text-[11px]">
                        {(m.display_name ?? '?').slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>
                    {m.display_name ?? t('trips.chat.anonymous', 'Someone')}
                  </TooltipContent>
                </Tooltip>
              ))}
              {overflow > 0 && (
                <Avatar className="h-[22px] w-[22px] border border-background bg-muted">
                  <AvatarFallback className="text-[11px]">+{overflow}</AvatarFallback>
                </Avatar>
              )}
            </div>
          </TooltipProvider>
          <span className="text-[11px] text-muted-foreground">
            {t('trips.chat.viewing', {
              defaultValue: '{{count}} viewing now',
              count: presentMembers.length,
            })}
          </span>
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto flex flex-col gap-3 pr-2 mb-4"
      >
        {(!messages || messages.length === 0) && (
          <EmptyState
            icon={MessageCircle}
            title={t('trips.chat.emptyTitle', 'Start the trip chat')}
            description={t(
              'trips.chat.emptyDescription',
              'Everyone on the trip sees this conversation. Share links, pin questions, coordinate check-ins.',
            )}
          />
        )}

        {(messages ?? []).map((m) => {
          const mine = m.sender_id === user?.id;
          const initial = (m.sender?.display_name ?? '?').slice(0, 1).toUpperCase();
          return (
            <div
              key={m.id}
              className={cn(
                'flex gap-3 items-start',
                mine ? 'flex-row-reverse' : 'flex-row',
              )}
            >
              <Avatar className="h-8 w-8 flex-shrink-0">
                {m.sender?.avatar_url && (
                  <AvatarImage src={m.sender.avatar_url} alt={m.sender?.display_name ?? ''} />
                )}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  'max-w-[78%] p-2.5 rounded-lg',
                  mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                )}
              >
                {!mine && (
                  <p className="font-bold text-xs mb-0.5">
                    {m.sender?.display_name ?? t('trips.chat.anonymous', 'Someone')}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                <p className="text-[11px] opacity-70 mt-1">
                  {format(new Date(m.created_at), 'MMM d, HH:mm')}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 items-end">
        <Textarea
          rows={1}
          placeholder={t('trips.chat.placeholder', 'Message the trip…')}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
          onKeyDown={onKeyDown}
          disabled={send.isPending}
          className="flex-1 min-h-[40px] max-h-[120px]"
        />
        <Button
          variant="brand"
          onClick={onSend}
          disabled={!draft.trim() || send.isPending}
          aria-label={t('trips.chat.send', 'Send')}
        >
          <Send size={14} />
        </Button>
      </div>
    </div>
  );
}
