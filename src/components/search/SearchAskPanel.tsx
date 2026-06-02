import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Sparkles, Loader2, CornerDownLeft } from 'lucide-react';
import { TYPE_ICONS } from '@/hooks/useSearchSuggestions';
import { SearchResultRow } from './SearchResultRow';
import type { AssistantMessage } from '@/hooks/useAssistant';
import type { AssistantCard } from '@/lib/assistantClient';

export interface SearchAskPanelProps {
  messages: AssistantMessage[];
  pending: boolean;
  error: string | null;
  onSend: (message: string) => void;
  onBack: () => void;
  onSelectCard: (card: AssistantCard) => void;
}

export function SearchAskPanel({
  messages,
  pending,
  error,
  onSend,
  onBack,
  onSelectCard,
}: SearchAskPanelProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the latest turn in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft('');
    onSend(text);
  };

  return (
    <div className="flex h-[480px] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-badge px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('search.ask.back', 'Back to search')}
        </button>
        <span className="ml-auto inline-flex items-center gap-1.5 text-13 font-semibold">
          <Sparkles className="h-4 w-4" />
          {t('search.ask.title', 'Ask the guide')}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-element bg-foreground px-3 py-2 text-sm text-background">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="space-y-2">
              {m.text && <p className="text-sm leading-relaxed text-foreground">{m.text}</p>}
              {m.cards && m.cards.length > 0 && (
                <div className="-mx-4 border-y border-border">
                  {m.cards.map((card) => {
                    const Icon = (TYPE_ICONS[card.type] ?? Sparkles) as React.ComponentType<{
                      className?: string;
                    }>;
                    const subtitle = [card.city, card.country].filter(Boolean).join(' · ');
                    return (
                      <SearchResultRow
                        key={`${card.type}-${card.objectID}`}
                        image={card.imageUrl}
                        Icon={Icon}
                        name={card.title ?? ''}
                        subtitle={subtitle || card.category || card.type}
                        onClick={() => onSelectCard(card)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ),
        )}

        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('search.ask.thinking', 'Thinking…')}
          </div>
        )}
        {error && !pending && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {messages.length === 0 && !pending && (
          <p className="text-sm text-muted-foreground">
            {t(
              'search.ask.placeholder',
              'Ask about venues, events, safety, or anything LGBTQ+ travel.',
            )}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t('search.ask.input', 'Ask a question…')}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim() || pending}
          aria-label={t('search.ask.send', 'Send')}
          className="inline-flex items-center justify-center rounded-element border border-border p-1.5 text-foreground transition-colors hover:bg-accent disabled:opacity-40"
        >
          <CornerDownLeft className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
