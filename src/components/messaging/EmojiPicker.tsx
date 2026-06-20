import { useState, useDeferredValue, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EMOJI_CATEGORIES, searchEmojis } from '@/lib/emojiData';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  trigger: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

function EmojiGrid({ items, onPick }: { items: { e: string }[]; onPick: (e: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {items.map(({ e }, i) => (
        <button
          key={`${e}-${i}`}
          type="button"
          onClick={() => onPick(e)}
          className="flex h-8 w-8 items-center justify-center rounded-element text-lg transition-colors hover:bg-muted"
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/**
 * Searchable, category-tabbed emoji picker built on the shared Popover/Tabs
 * primitives + the local emoji catalogue (no extra dependency). Includes a
 * dedicated Pride group. Search is deferred so typing stays smooth.
 */
export function EmojiPicker({ onSelect, trigger, side = 'top', align = 'end' }: EmojiPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const results = deferredQuery ? searchEmojis(deferredQuery) : [];

  const pick = (emoji: string) => {
    onSelect(emoji);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-[320px] p-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('chat.emoji.search', { defaultValue: 'Search emoji' })}
          className="mb-2 h-9 rounded-element"
        />
        {deferredQuery ? (
          <ScrollArea className="h-[220px] pr-2">
            {results.length ? (
              <EmojiGrid items={results} onPick={pick} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('chat.emoji.none', { defaultValue: 'No emoji found.' })}
              </p>
            )}
          </ScrollArea>
        ) : (
          <Tabs defaultValue={EMOJI_CATEGORIES[0].id}>
            <TabsList className="flex h-auto w-full justify-between gap-0.5 bg-transparent p-0">
              {EMOJI_CATEGORIES.map((c) => (
                <TabsTrigger
                  key={c.id}
                  value={c.id}
                  className="flex-1 px-0 py-1 text-base data-[state=active]:bg-muted"
                  title={t(`chat.emoji.cat.${c.id}`, { defaultValue: c.label })}
                >
                  {c.icon}
                </TabsTrigger>
              ))}
            </TabsList>
            {EMOJI_CATEGORIES.map((c) => (
              <TabsContent key={c.id} value={c.id} className="mt-2">
                <ScrollArea className="h-[200px] pr-2">
                  <EmojiGrid items={c.emojis} onPick={pick} />
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
}
