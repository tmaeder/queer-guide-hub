import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, PenSquare } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RecipientPicker, type PickedRecipient } from '@/components/messaging/RecipientPicker';
import { useMessaging } from '@/hooks/useMessaging';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useInboxFeed } from '@/hooks/useInboxFeed';
import { SignalRow } from './SignalPanel';

/** The Messages tab of the Hub menu: latest chats and mail, plus inbox links. */
export function MessagesPeek({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  const { items, loading } = useInboxFeed('all');
  const rows = items.filter((i) => i.kind !== 'notification').slice(0, 4);
  const [composing, setComposing] = useState(false);

  if (composing) return <NewMessage onDone={() => setComposing(false)} />;

  return (
    <div className="w-full">
      {loading ? (
        <p className="px-4 py-6 text-center text-13 text-muted-foreground">
          {t('inbox.loading', { defaultValue: 'Loading…' })}
        </p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-13 text-muted-foreground">
          {t('inbox.noMessages', { defaultValue: 'No messages yet.' })}
        </p>
      ) : (
        <div className="flex flex-col gap-0.5 px-1.5 py-2">
          {rows.map((item) => (
            <SignalRow
              key={item.id}
              item={item}
              onSelect={(i) => {
                onNavigate();
                navigate(i.open_target);
              }}
            />
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 rounded-b-container bg-surface-container px-2 py-1.5 text-xs font-bold">
        <LocalizedLink
          to="/messages"
          onClick={onNavigate}
          className="inline-flex min-h-9 items-center gap-1 rounded-badge px-2 no-underline transition-colors hover:bg-surface-container-high"
        >
          {t('inbox.openInbox', { defaultValue: 'Open inbox' })}
          <ArrowRight size={14} aria-hidden />
        </LocalizedLink>
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="inline-flex min-h-9 items-center gap-1 rounded-badge px-2 text-muted-foreground transition-colors hover:bg-surface-container-high hover:text-foreground"
        >
          <PenSquare size={14} aria-hidden />
          {t('inbox.compose.message', { defaultValue: 'New message' })}
        </button>
      </div>
    </div>
  );
}

/**
 * "New message" inside the Hub menu: pick a person (the inbox's own recipient
 * search, short list), then write and send. Back returns to the list.
 */
function NewMessage({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [to, setTo] = useState<{ conversationId: string; person: PickedRecipient } | null>(null);

  return (
    <div className="flex w-full flex-col gap-2 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (to ? setTo(null) : onDone())}
          aria-label={t('common.back', { defaultValue: 'Back' })}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-badge transition-colors hover:bg-surface-container-high"
        >
          <ArrowLeft size={16} aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate text-13 font-bold">
          {to
            ? to.person.display_name || t('people.card.member', 'Member')
            : t('inbox.compose.message', { defaultValue: 'New message' })}
        </span>
      </div>
      {to ? (
        <MessageForm conversationId={to.conversationId} onSent={onDone} />
      ) : (
        <RecipientPicker
          limit={4}
          onPicked={(conversationId, person) => setTo({ conversationId, person })}
        />
      )}
    </div>
  );
}

function MessageForm({ conversationId, onSent }: { conversationId: string; onSent: () => void }) {
  const { t } = useTranslation();
  const { sendMessage } = useMessaging();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await sendMessage(conversationId, text);
      onSent();
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2 rounded-element bg-card p-1.5">
      <Textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter makes a new line (as in the chat view).
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        rows={2}
        aria-label={t('chat.composer.label', 'Message')}
        placeholder={t('chat.composer.label', 'Message')}
        className="max-h-24 min-h-9 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-13 shadow-none focus-visible:ring-0"
      />
      <Button type="submit" size="sm" loading={sending} disabled={!text.trim()}>
        {t('messaging.sendMessage', 'Send')}
      </Button>
    </form>
  );
}
