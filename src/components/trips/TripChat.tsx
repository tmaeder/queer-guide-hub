import { useState, useRef, useEffect } from 'react';
import { Send, Reply, X, MessageCircle } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useTripMessages, type TripMessage } from '@/hooks/useTripCollaboration';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface Props {
  tripId: string;
}

export function TripChat({ tripId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: messages, isLoading, sendMessage } = useTripMessages(tripId);
  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<TripMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const count = messages?.length ?? 0;
    if (count > prevCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCountRef.current = count;
  }, [messages?.length]);

  useEffect(() => {
    if (!isLoading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isLoading]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage.mutate(
      { content: text, replyTo: replyTo?.id },
      {
        onError: (err) =>
          toast({ title: 'Failed to send message', description: String(err), variant: 'destructive' }),
      },
    );
    setInput('');
    setReplyTo(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
    return format(date, 'MMM d, HH:mm');
  };

  const findReplyMessage = (id: string | null) =>
    id ? messages?.find((m) => m.id === id) : null;

  if (isLoading) return <PageLoadingState count={3} variant="list" />;

  return (
    <div className="flex flex-col h-full min-h-[400px] max-h-[600px]">
      {/* Messages list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 p-3"
        style={{ overscrollBehavior: 'contain' }}
      >
        {(!messages || messages.length === 0) && (
          <ScrollReveal>
            <div className="flex flex-col items-center justify-center py-10 text-center flex-1">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageCircle size={24} style={{ opacity: 0.5 }} />
              </div>
              <p className="text-sm font-semibold">Start the conversation</p>
              <p className="text-sm text-muted-foreground">Share ideas for your trip</p>
            </div>
          </ScrollReveal>
        )}

        {messages?.map((msg) => {
          const isOwn = msg.sender_id === user?.id;
          const replyMsg = findReplyMessage(msg.reply_to);
          const initial = (msg.sender?.display_name || 'U')[0].toUpperCase();
          return (
            <div key={msg.id} className={cn('flex gap-2 group', isOwn && 'flex-row-reverse')}>
              <Avatar className="h-6 w-6 mt-0.5">
                {msg.sender?.avatar_url && (
                  <AvatarImage src={msg.sender.avatar_url} alt={msg.sender?.display_name || 'User'} />
                )}
                <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
              </Avatar>

              <div className={cn('max-w-[75%]', isOwn ? 'items-end' : 'items-start')}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] font-semibold">
                    {isOwn ? 'You' : msg.sender?.display_name || 'Unknown'}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatTimestamp(msg.created_at)}
                  </span>
                </div>

                {replyMsg && (
                  <div className="border-l-2 border-primary/40 pl-2 mb-1 rounded-badge bg-muted py-1 px-2">
                    <span className="block text-[10px] text-muted-foreground">
                      {replyMsg.sender?.display_name || 'Unknown'}
                    </span>
                    <span className="block text-[11px] truncate max-w-[200px]">
                      {replyMsg.content}
                    </span>
                  </div>
                )}

                <div
                  className={cn(
                    'rounded-element p-3',
                    isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                  )}
                >
                  <p className="text-[13px] whitespace-pre-wrap break-words">{msg.content}</p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyTo(msg)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 p-0 mt-0.5"
                >
                  <Reply size={12} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border bg-muted">
          <Reply size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <span className="block text-[11px] font-semibold">
              Replying to {replyTo.sender?.display_name || 'Unknown'}
            </span>
            <span className="block text-[11px] text-muted-foreground truncate">
              {replyTo.content}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setReplyTo(null)}
            className="h-7 w-7 p-0"
          >
            <X size={14} />
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2 items-end mt-2 p-3 border-t border-border">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 text-[13px] min-h-[40px] max-h-[120px]"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSend}
          disabled={!input.trim() || sendMessage.isPending}
          className="h-9 w-9 p-0 text-primary"
        >
          <Send size={18} />
        </Button>
      </div>
    </div>
  );
}
