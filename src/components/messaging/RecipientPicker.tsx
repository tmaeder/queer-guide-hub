import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMessaging } from '@/hooks/useMessaging';

interface Suggestion {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  reason: string;
}

/**
 * "New message" recipient picker: shows recently-messaged + recently-active
 * people (server-suggested), filterable by name. Selecting starts (or reuses) a
 * direct conversation and hands the id back to open it.
 */
export function RecipientPicker({
  open,
  onOpenChange,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: (conversationId: string) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { startConversation } = useMessaging();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('suggest_message_recipients', {
        p_user: user.id,
        p_limit: 12,
      } as never);
      if (!cancelled) setSuggestions(((data as Suggestion[]) ?? []));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const filtered = query
    ? suggestions.filter((s) => (s.display_name ?? '').toLowerCase().includes(query.toLowerCase()))
    : suggestions;

  const pick = async (userId: string) => {
    if (busy) return;
    setBusy(true);
    const convId = await startConversation(userId);
    setBusy(false);
    if (convId) {
      onPicked(convId as string);
      onOpenChange(false);
      setQuery('');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader className="mb-4">
          <SheetTitle>{t('inbox.compose.message', { defaultValue: 'New message' })}</SheetTitle>
        </SheetHeader>
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('inbox.recipient.search', { defaultValue: 'Search people' })}
          className="mb-4 rounded-element"
        />
        <ScrollArea className="h-[320px]">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('inbox.recipient.empty', { defaultValue: 'No suggestions yet.' })}
            </p>
          ) : (
            <div className="flex flex-col">
              {filtered.map((s) => (
                <button
                  key={s.user_id}
                  onClick={() => pick(s.user_id)}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-element p-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
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
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
