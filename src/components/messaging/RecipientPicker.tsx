import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMessaging } from '@/hooks/useMessaging';
import { cn } from '@/lib/utils';

/** The full inbox scrolls the list; the compact menu list never scrolls. */
function ListFrame({ compact, children }: { compact: boolean; children: ReactNode }) {
  if (compact) return <div>{children}</div>;
  return (
    <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
      {children}
    </ScrollArea>
  );
}

interface Suggestion {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  reason: string;
}

/**
 * "New message" recipient picker: shows recently-messaged + recently-active
 * people (server-suggested), filterable by name. Selecting starts (or reuses) a
 * direct conversation and hands the id back to open it. Renders inline, in the
 * inbox's reading pane.
 */
export interface PickedRecipient {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function RecipientPicker({
  onPicked,
  limit,
}: {
  onPicked: (conversationId: string, person: PickedRecipient) => void;
  /** Compact mode (the Hub menu): show at most this many people, no scroll area. */
  limit?: number;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { startConversation } = useMessaging();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('suggest_message_recipients', {
        p_user: user.id,
        p_limit: 12,
      } as never);
      if (!cancelled) setSuggestions((data as Suggestion[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const matching = query
    ? suggestions.filter((s) => (s.display_name ?? '').toLowerCase().includes(query.toLowerCase()))
    : suggestions;
  const filtered = limit ? matching.slice(0, limit) : matching;

  const pick = async (person: Suggestion) => {
    if (busy) return;
    setBusy(true);
    const convId = await startConversation(person.user_id);
    setBusy(false);
    if (convId) onPicked(convId as string, person);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('inbox.recipient.search', { defaultValue: 'Search people' })}
        aria-label={t('inbox.recipient.search', { defaultValue: 'Search people' })}
        className={cn('h-11 rounded-element', limit ? 'mb-2' : 'mb-4')}
      />
      <ListFrame compact={!!limit}>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('inbox.recipient.empty', { defaultValue: 'No suggestions yet.' })}
          </p>
        ) : (
          <div className="flex flex-col">
            {filtered.map((s) => (
              <button
                key={s.user_id}
                onClick={() => pick(s)}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-element p-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={s.avatar_url || ''} />
                  <AvatarFallback>{s.display_name?.charAt(0)?.toUpperCase() || 'U'}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-15">{s.display_name || 'Someone'}</span>
                  <span className="block text-2xs text-muted-foreground">
                    {s.reason === 'recent'
                      ? t('inbox.recipient.recent', { defaultValue: 'Recently messaged' })
                      : t('inbox.recipient.active', { defaultValue: 'Active recently' })}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </ListFrame>
    </div>
  );
}
