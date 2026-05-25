import { useEffect, useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGroupChat } from '@/hooks/useGroupChat';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface GroupChatProps {
  groupId: string;
  /** When false, render a read-only state telling the visitor to join. */
  canPost?: boolean;
}

function timeFmt(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Live group chat room. Members can read+write; non-members see the read-only
 * empty state. Realtime updates land via Supabase Realtime; RLS gates reads.
 */
export function GroupChat({ groupId, canPost = false }: GroupChatProps) {
  const { user } = useAuth();
  const { messages, loading, send, sending } = useGroupChat(groupId);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const safe = DOMPurify.sanitize(draft, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
    if (!safe || sending) return;
    setDraft('');
    await send(safe);
  };

  return (
    <section className="flex h-[600px] flex-col rounded-container border border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-4">
          {loading ? (
            <p className="text-center text-13 text-muted-foreground">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-13 text-muted-foreground">
              No messages yet.
              {canPost ? ' Say hello.' : ' Join the group to chat.'}
            </p>
          ) : (
            messages.map((m) => {
              const isOwn = m.sender_id === user?.id;
              const name = m.sender?.display_name ?? 'Member';
              return (
                <div
                  key={m.id}
                  className={cn(
                    'flex gap-2',
                    isOwn ? 'flex-row-reverse' : 'flex-row',
                  )}
                >
                  <Avatar style={{ width: 32, height: 32 }} className="shrink-0">
                    <AvatarImage src={m.sender?.avatar_url ?? undefined} alt="" />
                    <AvatarFallback className="text-13">{name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className={cn('flex max-w-[75%] flex-col gap-0.5', isOwn && 'items-end')}>
                    <div className="flex items-baseline gap-2 text-13 text-muted-foreground">
                      <span className="font-medium text-foreground">{name}</span>
                      <span className="tabular-nums">{timeFmt(m.created_at)}</span>
                    </div>
                    <div
                      className={cn(
                        'rounded-element border border-border px-3 py-2 text-sm whitespace-pre-wrap break-words',
                        isOwn ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground',
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={canPost ? 'Write a message…' : 'Join the group to chat'}
          disabled={!canPost || sending}
          aria-label="Message"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!canPost || sending || !draft.trim()}
          className="rounded-element"
          aria-label="Send"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </section>
  );
}
